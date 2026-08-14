import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installAuthTokenResilience } from "@/lib/auth-token";
import { registerServiceWorker } from "@/pwa/register-sw";

installAuthTokenResilience();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
