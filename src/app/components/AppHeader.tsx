import { useAuth } from '../../contexts/useAuth';
import NotificationBell from './NotificationBell';

export default function AppHeader() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="bg-[#1A1A1A] text-white shadow-lg sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm text-gray-300 hidden sm:block">
              {user.user_metadata?.name || user.email}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <NotificationBell userId={user.id} />
          </div>
        </div>
      </div>
    </div>
  );
}