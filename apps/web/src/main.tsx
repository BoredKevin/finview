/**
 * FinView Application Main Entry Point
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./auth/index.js";
import { Dashboard } from "./dashboard/Dashboard.js";
import "@boredkevin/ui/theme.css";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </React.StrictMode>
  );
}
