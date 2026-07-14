import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../lib/supabase";

interface Project {
  id: string;
  name: string;
  address: string;
  client_name: string;
  description: string;
}

interface Visit {
  id: string;
  date: string;
  notes: string;
  weather: string;
}

export default function ProjectDetailScreen({ route, navigation }: any) {
  const { projectId } = route.params;
  const [project, setProject] = useState<Project | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      // Load project
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Load visits
      const { data: visitsData, error: visitsError } = await supabase
        .from("visits")
        .select("*")
        .eq("project_id", projectId)
        .order("date", { ascending: false });

      if (visitsError) throw visitsError;
      setVisits(visitsData || []);
    } catch (error: any) {
      Alert.alert("Erreur", "Impossible de charger les données");
      console.error("Load project error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !project) {
    return (
      <View style={styles.container}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Project Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informations du projet</Text>
        <View style={styles.infoCard}>
          <Text style={styles.projectName}>{project.name}</Text>
          <Text style={styles.infoText}>📍 {project.address}</Text>
          {project.client_name && <Text style={styles.infoText}>👤 {project.client_name}</Text>}
          {project.description && <Text style={styles.description}>{project.description}</Text>}
        </View>
      </View>

      {/* Visits */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visites ({visits.length})</Text>
        {visits.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Aucune visite</Text>
          </View>
        ) : (
          visits.map((visit) => (
            <View key={visit.id} style={styles.visitCard}>
              <View style={styles.visitHeader}>
                <Text style={styles.visitDate}>
                  {new Date(visit.date).toLocaleDateString("fr-CA", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              </View>
              {visit.weather && <Text style={styles.visitWeather}>🌤️ {visit.weather}</Text>}
              {visit.notes && <Text style={styles.visitNotes}>{visit.notes}</Text>}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1A1A1A",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  infoCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  projectName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#E10600",
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: "#1A1A1A",
    marginTop: 12,
    lineHeight: 20,
  },
  visitCard: {
    backgroundColor: "#fff",
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  visitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  visitDate: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    textTransform: "capitalize",
  },
  visitWeather: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  visitNotes: {
    fontSize: 14,
    color: "#1A1A1A",
    lineHeight: 20,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
  },
});
