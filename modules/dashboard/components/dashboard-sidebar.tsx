"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Code2,
  Compass,
  FolderPlus,
  History,
  Home,
  LayoutDashboard,
  Lightbulb,
  type LucideIcon,
  Plus,
  Settings,
  Star,
  Terminal,
  Zap,
  Database,
  FlameIcon,
  Sparkles,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

interface PlaygroundData {
  id: string
  name: string
  icon: string
  starred: boolean
}

const lucideIconMap: Record<string, LucideIcon> = {
  Zap,
  Lightbulb,
  Database,
  Compass,
  FlameIcon,
  Terminal,
  Code2,
  Sparkles,
}

export function DashboardSidebar({
  initialPlaygroundData = [],
}: {
  initialPlaygroundData?: PlaygroundData[]
}) {
  const pathname = usePathname()
  const [starredPlaygrounds, setStarredPlaygrounds] = useState(
    initialPlaygroundData?.filter((p) => p.starred) ?? []
  )
  const [recentPlaygrounds, setRecentPlaygrounds] = useState(initialPlaygroundData ?? [])

  const toggleStar = (id: string) => {
    const playground = recentPlaygrounds.find((p) => p.id === id)
    if (!playground) return
    if (starredPlaygrounds.find((p) => p.id === id)) {
      setStarredPlaygrounds(starredPlaygrounds.filter((p) => p.id !== id))
    } else {
      setStarredPlaygrounds([...starredPlaygrounds, playground])
    }
  }

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      className="border-r border-white/[0.06] bg-[#0d1117]"
    >
      {/* Header */}
      <SidebarHeader className="border-b border-white/[0.06] bg-[#0d1117]">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_0_16px_rgba(99,102,241,0.4)] flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 13L8 3L13 13M5.5 9H10.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-bold text-white tracking-tight">
              Code<span className="text-indigo-400">Forge</span>
            </span>
            <span className="text-xs text-slate-500">Workspace</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-[#0d1117]">
        {/* Main Navigation */}
        <SidebarGroup className="pt-4">
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-4 pb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarMenu>
            {[
              { href: "/", label: "Home", icon: Home },
              { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            ].map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={label}
                  className={`
                    h-9 rounded-lg mx-2 transition-all duration-200
                    ${pathname === href
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                    }
                  `}
                >
                  <Link href={href}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* Starred */}
        <SidebarGroup className="pt-4">
          <div className="flex items-center justify-between px-4 pb-2">
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 flex items-center gap-1.5 p-0">
              <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              Starred
            </SidebarGroupLabel>
            <SidebarGroupAction title="Add to starred" className="hover:text-white text-slate-600 relative static">
              <Plus className="h-3.5 w-3.5" />
            </SidebarGroupAction>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {starredPlaygrounds.length === 0 ? (
                <div className="mx-4 px-3 py-5 rounded-xl border border-dashed border-white/[0.08] text-center">
                  <Star className="h-5 w-5 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-600">No starred projects</p>
                </div>
              ) : (
                starredPlaygrounds.map((playground) => {
                  const IconComponent = lucideIconMap[playground.icon] || Code2
                  return (
                    <SidebarMenuItem key={playground.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === `/playground/${playground.id}`}
                        tooltip={playground.name}
                        className="h-9 rounded-lg mx-2 text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all duration-200"
                      >
                        <Link href={`/playground/${playground.id}`}>
                          <IconComponent className="h-4 w-4" />
                          <span className="truncate">{playground.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Recent */}
        <SidebarGroup className="pt-4">
          <div className="flex items-center justify-between px-4 pb-2">
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 flex items-center gap-1.5 p-0">
              <History className="h-3 w-3" />
              Recent
            </SidebarGroupLabel>
            <SidebarGroupAction title="Create new playground" className="hover:text-white text-slate-600 relative static">
              <FolderPlus className="h-3.5 w-3.5" />
            </SidebarGroupAction>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentPlaygrounds.length === 0 ? (
                <div className="mx-4 px-3 py-5 rounded-xl border border-dashed border-white/[0.08] text-center">
                  <FolderPlus className="h-5 w-5 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-600 mb-3">No projects yet</p>
                  <Button variant="outline" size="sm" className="text-xs h-7 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 bg-transparent" asChild>
                    <Link href="/playground/new">
                      <Plus className="h-3 w-3 mr-1" />
                      New Project
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  {recentPlaygrounds.slice(0, 5).map((playground) => {
                    const IconComponent = lucideIconMap[playground.icon] || Code2
                    return (
                      <SidebarMenuItem key={playground.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={pathname === `/playground/${playground.id}`}
                          tooltip={playground.name}
                          className="h-9 rounded-lg mx-2 text-slate-400 hover:text-white hover:bg-white/[0.05] group transition-all duration-200"
                        >
                          <Link href={`/playground/${playground.id}`}>
                            <IconComponent className="h-4 w-4" />
                            <span className="truncate">{playground.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                  {recentPlaygrounds.length > 5 && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip="View all" className="h-9 rounded-lg mx-2 text-slate-600 hover:text-slate-400 hover:bg-white/[0.03] transition-all duration-200">
                        <Link href="/playgrounds" className="flex items-center gap-1">
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span className="text-xs">View all ({recentPlaygrounds.length})</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-white/[0.06] bg-[#0d1117]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings" className="h-10 rounded-lg mx-2 text-slate-500 hover:text-white hover:bg-white/[0.05] transition-all duration-200">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}