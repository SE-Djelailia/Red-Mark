import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

// Screens (we'll create these next)
import AuthScreen from "./screens/AuthScreen";
import ProjectsListScreen from "./screens/ProjectsListScreen";
import ProjectDetailScreen from "./screens/ProjectDetailScreen";

const Stack = createStackNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: "#E10600",
          },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      >
        {!session ? (
          // Not logged in - show auth screen
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        ) : (
          // Logged in - show app screens
          <>
            <Stack.Screen
              name="Projects"
              component={ProjectsListScreen}
              options={{ title: "Mes Projets" }}
            />
            <Stack.Screen
              name="ProjectDetail"
              component={ProjectDetailScreen}
              options={{ title: "Détails du Projet" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
