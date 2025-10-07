import React from 'react'

function emptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <img src="/empty-state-illustration.svg" alt="No Projects" className="w-48 h-48 mb-4"/>
        <h2 className="text-2xl font-semibold mb-2">No Projects Yet</h2>
        <p className="text-muted-foreground mb-6">Create your first project to get started.</p>
        <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition">
            New Project
        </button>
    </div>
  )
}

export default emptyState