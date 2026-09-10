import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import TzScreen from "./App";
import Dashboard from "./Dashboard";
import Stub from "./Stub";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/home" element={<Dashboard />} />
        <Route path="/projects" element={<TzScreen />} />
        <Route path="/overview" element={<Stub title="Обзор" />} />
      </Routes>
    </HashRouter>
  </StrictMode>
);
