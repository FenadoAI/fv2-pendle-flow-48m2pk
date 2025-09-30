import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import VaultTracker from "./components/VaultTracker";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<VaultTracker />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
