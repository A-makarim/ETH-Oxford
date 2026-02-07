import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import App from "./App";
import "./styles.css";
import { wagmiConfig } from "./wagmi";

const queryClient = new QueryClient();
const rootElement = document.getElementById("root");

function reportBootError(message: string) {
  if (!rootElement) {
    return;
  }
  let overlay = document.getElementById("boot-error");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "boot-error";
    overlay.className = "boot-error";
    rootElement.appendChild(overlay);
  }
  overlay.textContent = message;
}

window.addEventListener("error", (event) => {
  if (event?.message) {
    reportBootError(event.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (event?.reason) {
    reportBootError(String(event.reason));
  }
});

if (!rootElement) {
  throw new Error("Missing root element.");
}

ReactDOM.createRoot(rootElement).render(
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </WagmiProvider>
);

