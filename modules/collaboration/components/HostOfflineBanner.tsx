"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface HostOfflineBannerProps {
  socket: any;
  sessionId: string;
  isHost: boolean;
}

export function HostOfflineBanner({ socket, sessionId, isHost }: HostOfflineBannerProps) {
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!socket || isHost) return;

    const handleHostDisconnected = (data: {
      sessionId: string;
      message: string;
    }) => {
      if (data.sessionId === sessionId) {
        setHostDisconnected(true);
        setReconnecting(false);
      }
    };

    const handleHostReconnected = (data: {
      sessionId: string;
    }) => {
      if (data.sessionId === sessionId) {
        setHostDisconnected(false);
        setReconnecting(false);
      }
    };

    const handleReconnecting = () => {
      setReconnecting(true);
    };

    socket.on("webcontainer:host-disconnected", handleHostDisconnected);
    socket.on("webcontainer:host-reconnected", handleHostReconnected);
    socket.on("reconnecting", handleReconnecting);

    return () => {
      socket.off("webcontainer:host-disconnected", handleHostDisconnected);
      socket.off("webcontainer:host-reconnected", handleHostReconnected);
      socket.off("reconnecting", handleReconnecting);
    };
  }, [socket, sessionId, isHost]);

  if (isHost || (!hostDisconnected && !reconnecting)) {
    return null;
  }

  return (
    <Alert variant={reconnecting ? "default" : "destructive"} className="m-4">
      {reconnecting ? (
        <Wifi className="h-4 w-4 animate-pulse" />
      ) : (
        <WifiOff className="h-4 w-4" />
      )}
      <AlertTitle>
        {reconnecting ? "Reconnecting..." : "Host Disconnected"}
      </AlertTitle>
      <AlertDescription>
        {reconnecting
          ? "Attempting to reconnect to the host. Your changes are still being saved."
          : "The host has disconnected. Preview and terminal are paused. You can still edit files, and everything will sync when the host returns."}
      </AlertDescription>
    </Alert>
  );
}