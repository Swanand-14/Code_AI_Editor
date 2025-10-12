import React from 'react'
import AddNewButton from '@/modules/dashboard/components/add-new';
import AddRepo from '@/modules/dashboard/components/add-new-repo';
import { deleteProject, duplicateProjectId, editProjectById, getAllPlaygrounds } from '@/modules/dashboard/actions';
import ProjectTable from '@/modules/dashboard/components/project-table';
import EmptyState from '@/modules/dashboard/components/empty-state';

const page = async() =>{
    const playgrounds = await getAllPlaygrounds();
  return (
    <div className='flex flex-col justify-start items-center min-h-screen mx-auto max-w-7xl px-4 py-10'>
        <div className='grid grid-cols md:grid-cols-2 lg:grid-cols-3 gap-6 w-full'>
            <AddNewButton/>
            <AddRepo/>
            </div>
            <div className='mt-10 flex flex-col justify-center items-center w-full'>
                {
                    playgrounds && playgrounds.length === 0 ? (
                        <EmptyState/>) : (
                            // @ts-ignore
                            <ProjectTable projects={playgrounds || []}
                            onDeleteProject={deleteProject}
                            onUpdateProject={editProjectById}
                             // @ts-ignore
                            onDuplicateProject={duplicateProjectId}
                            />
                        )
                }
            </div>

            
            </div>
    
            
  )
}

export default page