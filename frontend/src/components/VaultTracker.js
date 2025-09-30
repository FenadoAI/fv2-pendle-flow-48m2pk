import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Slider } from './ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { TrendingUp, DollarSign, Calendar, BarChart3 } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8001';
const API = `${API_BASE}/api`;

const VaultTracker = () => {
  const [vaults, setVaults] = useState([]);
  const [filteredVaults, setFilteredVaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [volumeFilter, setVolumeFilter] = useState([0]);
  const [maxVolume, setMaxVolume] = useState(1000000);
  const [selectedVault, setSelectedVault] = useState(null);
  const [vaultDetails, setVaultDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchVaults();
  }, []);

  useEffect(() => {
    filterVaultsByVolume();
  }, [volumeFilter, vaults]);

  const fetchVaults = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/vaults`);

      if (response.data.success) {
        const vaultsData = response.data.vaults;
        setVaults(vaultsData);

        // Calculate max liquidity for slider
        const max = Math.max(...vaultsData.map(v => v.liquidity));
        setMaxVolume(max);
        setVolumeFilter([0]);

        setFilteredVaults(vaultsData);
      } else {
        setError(response.data.error || 'Failed to fetch vaults');
      }
    } catch (err) {
      console.error('Error fetching vaults:', err);
      setError('Failed to load vaults. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const filterVaultsByVolume = () => {
    const filtered = vaults.filter(vault => vault.liquidity >= volumeFilter[0]);
    setFilteredVaults(filtered);
  };

  const handleVaultClick = async (vault) => {
    setSelectedVault(vault);
    setLoadingDetails(true);

    try {
      const response = await axios.get(`${API}/vaults/${vault.address}?chain_id=${vault.chain_id}`);

      if (response.data.success) {
        setVaultDetails(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching vault details:', err);
      setVaultDetails({ error: 'Failed to load details' });
    } finally {
      setLoadingDetails(false);
    }
  };

  const formatCurrency = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatPercentage = (value) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Pendle Vault Explorer
          </h1>
          <p className="text-slate-300 text-lg">
            Discover and analyze Pendle yield markets with real-time data
          </p>
        </div>

        {/* Volume Filter */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Filter by Liquidity
            </CardTitle>
            <CardDescription className="text-slate-300">
              Showing {filteredVaults.length} vaults with liquidity ≥ {formatCurrency(volumeFilter[0])}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Slider
              value={volumeFilter}
              onValueChange={setVolumeFilter}
              max={maxVolume}
              step={10000}
              className="w-full"
            />
            <div className="flex justify-between mt-2 text-sm text-slate-400">
              <span>$0</span>
              <span>{formatCurrency(maxVolume)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vaults Grid */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
                <CardHeader>
                  <Skeleton className="h-6 w-32 bg-slate-700" />
                  <Skeleton className="h-4 w-24 bg-slate-700" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full bg-slate-700" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVaults.map((vault) => (
              <Card
                key={vault.address}
                className="bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:border-purple-500 transition-all cursor-pointer hover:shadow-lg hover:shadow-purple-500/20"
                onClick={() => handleVaultClick(vault)}
              >
                <CardHeader>
                  <CardTitle className="text-white flex items-center justify-between">
                    <span>{vault.name}</span>
                    <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">
                      Chain {vault.chain_id}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Expires: {formatDate(vault.expiry)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        Liquidity
                      </span>
                      <span className="text-white font-semibold">{formatCurrency(vault.liquidity)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        Implied APY
                      </span>
                      <span className="text-green-400 font-semibold">{formatPercentage(vault.implied_apy)}</span>
                    </div>
                    {vault.underlying_apy > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Underlying APY</span>
                        <span className="text-blue-400 font-semibold">{formatPercentage(vault.underlying_apy)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && filteredVaults.length === 0 && (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardContent className="py-12 text-center">
              <p className="text-slate-400 text-lg">No vaults found matching your filter criteria.</p>
              <p className="text-slate-500 text-sm mt-2">Try adjusting the liquidity filter.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Vault Details Modal */}
      <Dialog open={selectedVault !== null} onOpenChange={() => setSelectedVault(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl text-white">{selectedVault?.name}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedVault?.address}
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full bg-slate-700" />
              <Skeleton className="h-20 w-full bg-slate-700" />
              <Skeleton className="h-20 w-full bg-slate-700" />
            </div>
          ) : vaultDetails?.error ? (
            <div className="text-red-400 p-4 bg-red-500/10 rounded-lg">
              {vaultDetails.error}
            </div>
          ) : vaultDetails ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                <h3 className="text-lg font-semibold text-purple-400 mb-3">Market Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-400 text-sm">Chain ID</p>
                    <p className="text-white font-semibold">{selectedVault?.chain_id}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Expiry</p>
                    <p className="text-white font-semibold">{formatDate(selectedVault?.expiry)}</p>
                  </div>
                </div>
              </div>

              {/* Liquidity & Volume */}
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                <h3 className="text-lg font-semibold text-purple-400 mb-3">Liquidity & Volume</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Total Liquidity</span>
                    <span className="text-white font-semibold">{formatCurrency(selectedVault?.liquidity)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">24h Volume</span>
                    <span className="text-white font-semibold">{formatCurrency(selectedVault?.volume_24h)}</span>
                  </div>
                </div>
              </div>

              {/* APY Information */}
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                <h3 className="text-lg font-semibold text-purple-400 mb-3">Yield Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Implied APY</span>
                    <span className="text-green-400 font-semibold text-lg">{formatPercentage(selectedVault?.implied_apy)}</span>
                  </div>
                  {selectedVault?.underlying_apy > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Underlying APY</span>
                      <span className="text-blue-400 font-semibold">{formatPercentage(selectedVault?.underlying_apy)}</span>
                    </div>
                  )}
                  {selectedVault?.lp_apy > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">LP APY</span>
                      <span className="text-purple-400 font-semibold">{formatPercentage(selectedVault?.lp_apy)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Prices */}
              {(selectedVault?.pt_price > 0 || selectedVault?.yt_price > 0) && (
                <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">Token Prices</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedVault?.pt_price > 0 && (
                      <div>
                        <p className="text-slate-400 text-sm">PT Price</p>
                        <p className="text-white font-semibold">{formatCurrency(selectedVault?.pt_price)}</p>
                      </div>
                    )}
                    {selectedVault?.yt_price > 0 && (
                      <div>
                        <p className="text-slate-400 text-sm">YT Price</p>
                        <p className="text-white font-semibold">{formatCurrency(selectedVault?.yt_price)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Additional Details */}
              {vaultDetails && Object.keys(vaultDetails).length > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">Additional Details</h3>
                  <div className="text-xs text-slate-400 overflow-x-auto">
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(vaultDetails, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VaultTracker;
