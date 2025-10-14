import { SidebarProvider } from '@/components/ui/sidebar';
import React from 'react'

function PlaygroundLayout({
    children,
}:{
    children:React.ReactNode;
}) {
  return (
    <SidebarProvider>
        {children}
    </SidebarProvider>
  )
}

export default PlaygroundLayout