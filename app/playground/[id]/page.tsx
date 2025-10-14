"use client"
import { usePlayground } from '@/modules/playground/hooks/usePlayground';
import { useParams } from 'next/navigation'
import React from 'react'

function MainPlaygroundPage() {
    const {id} = useParams<{id:string}>();
    const {playgroundData,templateData,isLoading,error,saveTemplateData} = usePlayground(id)
    console.log("templateData",templateData);
    console.log("playgroundData",playgroundData)
  return (
    <div>${id}</div>
  )
}

export default MainPlaygroundPage