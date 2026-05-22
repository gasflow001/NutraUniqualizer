import { NavLink, Route, Routes } from "react-router-dom";
import Wizard from "./pages/Wizard";
import History from "./pages/History";
import Settings from "./pages/Settings";
import { ToastViewport } from "./components/Toast";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm transition ${
    isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
  }`;

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14">
          <div className="font-semibold tracking-tight">
            Nutra <span className="text-primary">Uniqualizer</span>
          </div>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>Master</NavLink>
            <NavLink to="/history" className={navClass}>History</NavLink>
            <NavLink to="/settings" className={navClass}>Settings</NavLink>
          </nav>
        </div>
      </header>
      <main className="container flex-1 py-6">
        <Routes>
          <Route path="/" element={<Wizard />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <ToastViewport />
    </div>
  );
}
