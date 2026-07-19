import { useNavigate, useLocation } from "react-router";

// Goes back one step in the actual browser history, so a "Retour" button
// retraces wherever the user really came from instead of jumping to a
// hardcoded route. Falls back to `fallbackPath` when there's no in-app
// history to go back to — `location.key` is only "default" for the very
// first entry in a browser navigation session (a direct link or a page
// refresh), so this is how react-router itself distinguishes "landed here
// directly" from "navigated here from somewhere in the app".
export function useSmartBack(fallbackPath: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();

  return () => {
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate(fallbackPath, { replace: true });
    }
  };
}
