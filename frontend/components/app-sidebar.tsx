"use client"

import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { GalleryVerticalEndIcon, Sparkles, Route, History, Database } from "lucide-react"

const TABS = [
  { id: "easy",    label: "Easy",    color: "#4ade80", sub: "Prompt Engineering",    icon: Sparkles },
  { id: "medium",  label: "Medium",  color: "#fb923c", sub: "Agentic Router",         icon: Route },
  { id: "hard",    label: "Hard",    color: "#f472b6", sub: "Context Rot",            icon: History },
  { id: "complex", label: "Complex", color: "#38bdf8", sub: "Structured Data vs RAG", icon: Database },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

export function AppSidebar({ activeTab, setActiveTab, ...props }: AppSidebarProps) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex items-center gap-2">
                <div className="flex aspect-square size-8 items-center justify-center  text-sidebar-primary-foreground">
                  <GalleryVerticalEndIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-sm">GenAI Workshop</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {TABS.map((tab) => (
              <SidebarMenuItem key={tab.id} className="mb-2">
                <SidebarMenuButton 
                  isActive={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-auto py-2.5 group border transition-all ${
                    activeTab === tab.id 
                      ? "bg-sidebar-accent border-border/50 shadow-sm" 
                      : "bg-transparent border-transparent hover:bg-sidebar-accent hover:shadow-sm"
                  }`}
                >
                  <tab.icon 
                    className={`size-4 shrink-0 ${
                      activeTab === tab.id ? "" : "text-muted-foreground opacity-50"
                    }`}
                  />
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span className={`font-medium leading-none transition-colors ${
                      activeTab === tab.id ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {tab.label}
                    </span>
                    <span className="text-xs text-muted-foreground line-clamp-1">{tab.sub}</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
