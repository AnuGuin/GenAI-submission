"use client";
import { useState } from "react";
import EasyPanel from "@/components/Easypanel";
import MediumPanel from "@/components/Mediumpanel";
import HardPanel from "@/components/Hardpanel";
import ComplexPanel from "@/components/Complexpanel";
import { ModeToggle } from "@/components/mode-toggle";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Github } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function Home() {
  const [active, setActive] = useState("easy");

  return (
    <SidebarProvider>
      <AppSidebar activeTab={active} setActiveTab={setActive} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-card px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div>
              <h1 className="font-display text-lg font-700 text-foreground tracking-tight leading-none">
                GenAI Workshop
              </h1>
              <p className="text-xs text-muted-foreground font-body mt-1">Problem Solving Round · Agentic Demo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-easy animate-pulse2" />
            <span className="text-xs text-muted-foreground mr-4 font-mono hidden sm:inline-block">Gemini 2.5 Flash</span>
            <ModeToggle />
            <a 
              href="https://github.com/AnuGuin/GenAI-submission" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-8 grid-bg">
          <div className="max-w-6xl mx-auto">
            {active === "easy"    && <EasyPanel />}
            {active === "medium"  && <MediumPanel />}
            {active === "hard"    && <HardPanel />}
            {active === "complex" && <ComplexPanel />}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
