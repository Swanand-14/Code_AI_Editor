import { SidebarProvider } from "@/components/ui/sidebar";
import { getAllPlaygrounds } from "@/modules/dashboard/actions";
import { DashboardSidebar } from "@/modules/dashboard/components/dashboard-sidebar";
export default async function DashboardLayout({children}: {children: React.ReactNode}){
    const playgrounds = await getAllPlaygrounds();
    const technologyIconMap: Record<string, string> = {
        REACT: "ZAP",
        NEXTJS: "lightbulb",
        VITE: "VITE",
        EXPRESS: "SERVER",
        FASTIFY: "SERVER"
      }
      const formattedPlaygroundData = playgrounds?.map((item)=>({
        id: item.id,
        title: item.title,
        starred: false,
        icon: technologyIconMap[item.template] || "Code2"
      }))
    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full overflow-x-hidden">
                {/* @ts-ignore */}
                <DashboardSidebar initialPlaygrounds={formattedPlaygroundData || []}/>
                <main className="flex-1">
                    {children}
                </main></div>
            
        </SidebarProvider>
    )
}