import React, { useState } from 'react';
import { AlertTriangle, X, Info } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import NotificationBell from './NotificationBell';

export default function PilotBanner() {
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(() => {
    // Check if user has dismissed the banner in this session
    return !sessionStorage.getItem('pilotBannerDismissed');
  });

  const handleDismiss = () => {
    sessionStorage.setItem('pilotBannerDismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    null
  );
}