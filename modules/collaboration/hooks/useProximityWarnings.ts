"use client";


import { useEffect, useState, useRef } from "react";
import {toast} from "sonner"
import type { RemoteCursor } from "./useRemoteCursors";

interface ProximityWarning {
  userId: string;
  userName: string;
  distance: number;
  severity: "high" | "medium" | "low";
  lastWarned: number;
}

interface UseProximityWarningsProps {
  remoteCursors: RemoteCursor[];
  localCursorLine: number;
  enabled?: boolean;
}

const THRESHOLDS = {
  HIGH: 3,    // 1-3 lines: 🔴 High warning (toast + console)
  MEDIUM: 7,  // 4-7 lines: 🟡 Medium warning (console only)
  LOW: 8,     // 8+ lines: ✅ No warning
} as const;

const DEBOUNCE_MS = 5000; // Max 1 toast per user per 5 seconds
const STALE_THRESHOLD = 3000; // Ignore cursors older than 3 seconds


export function useProximityWarnings({ remoteCursors, localCursorLine, enabled = true }: UseProximityWarningsProps) {
    const warningHistoryRef = useRef<Map<string,ProximityWarning>>(new Map())
    const toastIdsRef = useRef<Map<string,string|number>>(new Map());
    useEffect(()=>{
        if(!enabled || remoteCursors.length === 0)return;
        const now = Date.now()
        const activeWarnings:ProximityWarning[] = []
        const activeCursors = remoteCursors.filter(cursors=>now - cursors.lastUpdate <STALE_THRESHOLD)
        activeCursors.forEach((cursor)=>{
            const distance = Math.abs(cursor.position.lineNumber - localCursorLine);
            let severity:"high"|"medium"|"low";
            if(distance<=THRESHOLDS.HIGH){
                severity = "high"
            }else if(distance<=THRESHOLDS.MEDIUM){
                severity = "medium"
            }else{
                severity = "low"
            }

            if(severity === "low")return;

            const warning : ProximityWarning = {
                userId:cursor.userId,
                userName:cursor.userName,
                distance,
                severity,
                lastWarned:now
            }

            activeWarnings.push(warning)
            const lastWarning = warningHistoryRef.current.get(cursor.userId);
            const shouldWarn = !lastWarning || (now - lastWarning.lastWarned)>DEBOUNCE_MS;
            const emoji = severity === "high" ? "🔴" : "🟡";
            const colorName = cursor.color?.name || "unknown";
            console.log(
        `${emoji} [Proximity] ${cursor.userName} (${colorName}) is ${distance} line(s) away | ` +
        `Your line: ${localCursorLine}, Their line: ${cursor.position.lineNumber}`
      );
        if(severity === "high" && shouldWarn){
            const existingToastId = toastIdsRef.current.get(cursor.userId);
            if(existingToastId){
                toast.dismiss(existingToastId)
            }
            const toastId = toast.warning(
          `${cursor.userName} is editing nearby`,
          {
            description: `Line ${cursor.position.lineNumber} (${distance} line${distance !== 1 ? 's' : ''} away)`,
            duration: 3000,
            action: {
              label: "Dismiss",
              onClick: () => toast.dismiss(toastId),
            },
          }
        );
        toastIdsRef.current.set(cursor.userId,toastId);
        warningHistoryRef.current.set(cursor.userId,warning)
        console.log(
          `🔔 [Toast] Warned about ${cursor.userName} at line ${cursor.position.lineNumber}`
        );






        }else if(severity === "high" && !shouldWarn){
            `⏭️ [Debounced] Skipped toast for ${cursor.userName} (warned ${((now - lastWarning.lastWarned) / 1000).toFixed(1)}s ago)`
        }



        })
        warningHistoryRef.current.forEach((warning,userId)=>{
            if(now - warning.lastWarned > DEBOUNCE_MS*2){
                warningHistoryRef.current.delete(userId)
                toastIdsRef.current.delete(userId)
            }
        });

        if (activeWarnings.length > 0) {
      const highCount = activeWarnings.filter(w => w.severity === "high").length;
      const mediumCount = activeWarnings.filter(w => w.severity === "medium").length;
      
      console.log(
        `📊 [Proximity Summary] ${activeWarnings.length} users nearby | ` +
        `🔴 ${highCount} high, 🟡 ${mediumCount} medium`
      );
    }


    },[remoteCursors,localCursorLine,enabled])

     useEffect(() => {
    return () => {
      toastIdsRef.current.forEach(toastId => toast.dismiss(toastId));
      toastIdsRef.current.clear();
      warningHistoryRef.current.clear();
    };
  }, []);

  return {
    warningCount: warningHistoryRef.current.size,
  };
}