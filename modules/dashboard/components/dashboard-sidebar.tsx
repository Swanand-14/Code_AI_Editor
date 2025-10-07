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
import Image from "next/image"
import { cn } from "@/lib/utils"

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
  initialPlaygroundData = []
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
    <Sidebar variant="inset" collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Image 
              src="/logo.svg" 
              alt="VibeCode Editor" 
              height={24} 
              width={24}
              className="dark:invert"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">VibeCode</span>
            <span className="text-xs text-muted-foreground">Editor</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === "/"} 
                tooltip="Home"
                className="h-9"
              >
                <Link href="/">
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === "/dashboard"} 
                tooltip="Dashboard"
                className="h-9"
              >
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Starred Section */}
        <SidebarGroup>
          <div className="flex items-center justify-between px-4 py-2">
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Star className="h-3.5 w-3.5 fill-current" />
              Starred
            </SidebarGroupLabel>
            <SidebarGroupAction 
              title="Add to starred" 
              className="hover:bg-sidebar-accent"
            >
              <Plus className="h-3.5 w-3.5" />
            </SidebarGroupAction>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {starredPlaygrounds.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <div className="mb-2 flex justify-center">
                    <Star className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No starred playgrounds yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    Star your favorites for quick access
                  </p>
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
                        className="h-9 group"
                      >
                        <Link href={`/playground/${playground.id}`}>
                          <IconComponent className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
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

        {/* Recent Section */}
        <SidebarGroup>
          <div className="flex items-center justify-between px-4 py-2">
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              Recent
            </SidebarGroupLabel>
            <SidebarGroupAction 
              title="Create new playground"
              className="hover:bg-sidebar-accent"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </SidebarGroupAction>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentPlaygrounds.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <div className="mb-2 flex justify-center">
                    <FolderPlus className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No playgrounds yet
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    asChild
                  >
                    <Link href="/playground/new">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Create Playground
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
                          className="h-9 group"
                        >
                          <Link href={`/playground/${playground.id}`}>
                            <IconComponent className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            <span className="truncate">{playground.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                  {recentPlaygrounds.length > 5 && (
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        asChild 
                        tooltip="View all playgrounds"
                        className="h-9"
                      >
                        <Link 
                          href="/playgrounds" 
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <span className="text-sm">
                            View all ({recentPlaygrounds.length})
                          </span>
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

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              tooltip="Settings"
              className="h-10"
            >
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