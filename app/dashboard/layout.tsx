import { SidebarProvider } from "@/components/ui/sidebar";
import { getAllPlaygrounds } from "@/modules/dashboard/actions";
import { DashboardSidebar } from "@/modules/dashboard/components/dashboard-sidebar";
export default async function DashboardLayout({children}: {children: React.ReactNode}){
    const playgrounds = await getAllPlaygrounds();
    const technologyIconMap: Record<string, string> = {
  REACT: "Zap",        // Capital Z
  NEXTJS: "Lightbulb", // Capital L
  VITE: "Zap",         // Use existing icon
  EXPRESS: "Database", // Use existing icon
  FASTIFY: "Terminal"  // Use existing icon
}
      const formattedPlaygroundData = playgrounds?.map((item)=>({
        id: item.id,
        name: item.title,
        starred: item.Starmark[0]?.isMarked || false,
        icon: technologyIconMap[item.template] || "Code2"
      }))
    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full overflow-x-hidden">
                {/* @ts-ignore */}
                <DashboardSidebar initialPlaygroundData={formattedPlaygroundData || []}/>
                <main className="flex-1">
                    {children}
                </main></div>
            
        </SidebarProvider>
    )
}