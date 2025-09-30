"""FastAPI server exposing AI agent endpoints."""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from ai_agents.agents import AgentConfig, ChatAgent, SearchAgent


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent


class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class ChatRequest(BaseModel):
    message: str
    agent_type: str = "chat"
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    success: bool
    response: str
    agent_type: str
    capabilities: List[str]
    metadata: dict = Field(default_factory=dict)
    error: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    max_results: int = 5


class SearchResponse(BaseModel):
    success: bool
    query: str
    summary: str
    search_results: Optional[dict] = None
    sources_count: int
    error: Optional[str] = None


class VaultData(BaseModel):
    address: str
    name: str
    symbol: str
    expiry: str
    chain_id: int
    volume_24h: float
    liquidity: float
    implied_apy: float
    underlying_apy: float
    lp_apy: float
    pt_price: float
    yt_price: float


class VaultsResponse(BaseModel):
    success: bool
    vaults: List[VaultData]
    total: int
    error: Optional[str] = None


def _ensure_db(request: Request):
    try:
        return request.app.state.db
    except AttributeError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=503, detail="Database not ready") from exc


def _get_agent_cache(request: Request) -> Dict[str, object]:
    if not hasattr(request.app.state, "agent_cache"):
        request.app.state.agent_cache = {}
    return request.app.state.agent_cache


async def _get_or_create_agent(request: Request, agent_type: str):
    cache = _get_agent_cache(request)
    if agent_type in cache:
        return cache[agent_type]

    config: AgentConfig = request.app.state.agent_config

    if agent_type == "search":
        cache[agent_type] = SearchAgent(config)
    elif agent_type == "chat":
        cache[agent_type] = ChatAgent(config)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown agent type '{agent_type}'")

    return cache[agent_type]


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_dotenv(ROOT_DIR / ".env")

    mongo_url = os.getenv("MONGO_URL")
    db_name = os.getenv("DB_NAME")

    if not mongo_url or not db_name:
        missing = [name for name, value in {"MONGO_URL": mongo_url, "DB_NAME": db_name}.items() if not value]
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    client = AsyncIOMotorClient(mongo_url)

    try:
        app.state.mongo_client = client
        app.state.db = client[db_name]
        app.state.agent_config = AgentConfig()
        app.state.agent_cache = {}
        logger.info("AI Agents API starting up")
        yield
    finally:
        client.close()
        logger.info("AI Agents API shutdown complete")


app = FastAPI(
    title="AI Agents API",
    description="Minimal AI Agents API with LangGraph and MCP support",
    lifespan=lifespan,
)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate, request: Request):
    db = _ensure_db(request)
    status_obj = StatusCheck(**input.model_dump())
    await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(request: Request):
    db = _ensure_db(request)
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_agent(chat_request: ChatRequest, request: Request):
    try:
        agent = await _get_or_create_agent(request, chat_request.agent_type)
        response = await agent.execute(chat_request.message)

        return ChatResponse(
            success=response.success,
            response=response.content,
            agent_type=chat_request.agent_type,
            capabilities=agent.get_capabilities(),
            metadata=response.metadata,
            error=response.error,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Error in chat endpoint")
        return ChatResponse(
            success=False,
            response="",
            agent_type=chat_request.agent_type,
            capabilities=[],
            error=str(exc),
        )


@api_router.post("/search", response_model=SearchResponse)
async def search_and_summarize(search_request: SearchRequest, request: Request):
    try:
        search_agent = await _get_or_create_agent(request, "search")
        search_prompt = (
            f"Search for information about: {search_request.query}. "
            "Provide a comprehensive summary with key findings."
        )
        result = await search_agent.execute(search_prompt, use_tools=True)

        if result.success:
            metadata = result.metadata or {}
            return SearchResponse(
                success=True,
                query=search_request.query,
                summary=result.content,
                search_results=metadata,
                sources_count=int(metadata.get("tool_run_count", metadata.get("tools_used", 0)) or 0),
            )

        return SearchResponse(
            success=False,
            query=search_request.query,
            summary="",
            sources_count=0,
            error=result.error,
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Error in search endpoint")
        return SearchResponse(
            success=False,
            query=search_request.query,
            summary="",
            sources_count=0,
            error=str(exc),
        )


@api_router.get("/agents/capabilities")
async def get_agent_capabilities(request: Request):
    try:
        search_agent = await _get_or_create_agent(request, "search")
        chat_agent = await _get_or_create_agent(request, "chat")

        return {
            "success": True,
            "capabilities": {
                "search_agent": search_agent.get_capabilities(),
                "chat_agent": chat_agent.get_capabilities(),
            },
        }
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Error getting capabilities")
        return {"success": False, "error": str(exc)}


@api_router.get("/vaults", response_model=VaultsResponse)
async def get_pendle_vaults(chain_id: int = 1):
    """Fetch all active Pendle vaults (markets) from Pendle API."""
    try:
        pendle_api_url = f"https://api-v2.pendle.finance/core/v1/{chain_id}/markets/active"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(pendle_api_url)
            response.raise_for_status()
            data = response.json()

        vaults = []
        for market in data.get("markets", []):
            try:
                details = market.get("details", {})
                vault = VaultData(
                    address=market.get("address", ""),
                    name=market.get("name", "Unknown"),
                    symbol=market.get("symbol", ""),
                    expiry=market.get("expiry", ""),
                    chain_id=chain_id,
                    volume_24h=float(details.get("volume24h", 0)),
                    liquidity=float(details.get("liquidity", 0)),
                    implied_apy=float(details.get("impliedApy", 0)),
                    underlying_apy=float(details.get("underlyingApy", 0)),
                    lp_apy=float(details.get("lpApy", 0)),
                    pt_price=float(details.get("ptPrice", 0)),
                    yt_price=float(details.get("ytPrice", 0)),
                )
                vaults.append(vault)
            except (ValueError, TypeError, KeyError) as e:
                logger.warning(f"Error parsing vault data for {market.get('address')}: {e}")
                continue

        return VaultsResponse(
            success=True,
            vaults=vaults,
            total=len(vaults),
        )

    except httpx.HTTPError as exc:
        logger.exception("Error fetching vaults from Pendle API")
        return VaultsResponse(
            success=False,
            vaults=[],
            total=0,
            error=f"Failed to fetch vaults: {str(exc)}",
        )
    except Exception as exc:
        logger.exception("Unexpected error in get_vaults")
        return VaultsResponse(
            success=False,
            vaults=[],
            total=0,
            error=str(exc),
        )


@api_router.get("/vaults/{vault_address}")
async def get_vault_details(vault_address: str, chain_id: int = 1):
    """Fetch detailed information for a specific Pendle vault."""
    try:
        pendle_api_url = f"https://api-v2.pendle.finance/core/v2/{chain_id}/markets/{vault_address}/data"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(pendle_api_url)
            response.raise_for_status()
            data = response.json()

        return {
            "success": True,
            "data": data,
        }

    except httpx.HTTPError as exc:
        logger.exception(f"Error fetching vault details for {vault_address}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch vault details: {str(exc)}",
        )
    except Exception as exc:
        logger.exception(f"Unexpected error fetching vault {vault_address}")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
