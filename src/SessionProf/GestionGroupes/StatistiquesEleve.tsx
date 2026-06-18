// src/SessionProf/GestionGroupes/StatistiquesEleve.tsx
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../supabaseClient";

type EvaluationNoteRow = {
  parcours_id: string;
  parcours_nom: string;
  note: number | null;
  max: number | null;
  updated_at: string | null;
};

const formatNumber = (value: number | null) => {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ",");
};

export default function StatistiquesEleve(props: any) {
  const eleve = props?.eleve ?? (globalThis as any).__selectedStatistiquesEleve;
  const studentId = eleve?.id ?? eleve?.uuid ?? null;
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<EvaluationNoteRow[]>([]);

  const studentName = useMemo(() => eleve?.name ?? eleve?.nom ?? "Aucun élève sélectionné", [eleve]);

  const loadNotes = React.useCallback(
    async (cancelledRef?: { current: boolean }) => {
      if (!studentId) {
        setNotes([]);
        return;
      }

      setLoading(true);
      try {
        const { data: stats, error } = await supabase
          .from("eleve_parcours_stats")
          .select("parcours_id,evaluation_note,evaluation_max_points,evaluation_updated_at,evaluation_bareme_id")
          .eq("student_id", studentId)
          .not("evaluation_bareme_id", "is", null)
          .order("evaluation_updated_at", { ascending: false });

        if (error) throw error;

        const parcoursIds = Array.from(new Set((stats || []).map((row: any) => String(row.parcours_id)).filter(Boolean)));
        let parcoursNames = new Map<string, string>();

        if (parcoursIds.length > 0) {
          const { data: parcoursRows, error: parcoursError } = await supabase
            .from("parcours")
            .select("id,nom")
            .in("id", parcoursIds);

          if (!parcoursError) {
            parcoursNames = new Map((parcoursRows || []).map((row: any) => [String(row.id), String(row.nom || "Parcours")]));
          }
        }

        const next = (stats || []).map((row: any) => ({
          parcours_id: String(row.parcours_id),
          parcours_nom: parcoursNames.get(String(row.parcours_id)) || "Parcours",
          note: row.evaluation_note == null ? null : Number(row.evaluation_note),
          max: row.evaluation_max_points == null ? null : Number(row.evaluation_max_points),
          updated_at: row.evaluation_updated_at ?? null,
        }));

        if (!cancelledRef?.current) setNotes(next);
      } catch (error) {
        console.error("Chargement notes évaluation impossible :", error);
        if (!cancelledRef?.current) setNotes([]);
      } finally {
        if (!cancelledRef?.current) setLoading(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    const cancelledRef = { current: false };

    loadNotes(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [loadNotes]);

  useEffect(() => {
    if (!studentId) return;

    const channel = supabase
      .channel(`evaluation-notes-${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "eleve_parcours_stats",
          filter: `student_id=eq.${studentId}`,
        },
        () => {
          loadNotes().catch(() => null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotes, studentId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#EDF2F6" }}>
      <View
        style={{
          height: 78,
          backgroundColor: "#1F5B86",
          justifyContent: "center",
          paddingHorizontal: 16,
        }}
      >
        <TouchableOpacity onPress={() => props.setPage?.("GestionEleves")}>
          <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>← Retour</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
        <Text style={{ fontSize: 24, fontWeight: "900", color: "#233548" }}>Statistiques élève</Text>

        <Text style={{ marginTop: 12, fontSize: 18, color: "#233548", fontWeight: "800" }}>
          Élève : {studentName}
        </Text>

        <View
          style={{
            marginTop: 18,
            borderRadius: 18,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "rgba(15,23,42,0.10)",
            padding: 16,
          }}
        >
          <Text style={{ color: "#0f172a", fontWeight: "900", fontSize: 18 }}>Notes d'évaluation</Text>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: "#64748B", fontWeight: "800" }}>Chargement...</Text>
            </View>
          ) : notes.length === 0 ? (
            <Text style={{ marginTop: 12, color: "#64748B", fontWeight: "800" }}>
              Aucune note d'évaluation pour le moment.
            </Text>
          ) : (
            <View style={{ marginTop: 12, gap: 10 }}>
              {notes.map((note) => (
                <View
                  key={note.parcours_id}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(15,23,42,0.10)",
                    backgroundColor: "#F8FAFC",
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#0f172a", fontWeight: "900", fontSize: 15 }} numberOfLines={2}>
                      {note.parcours_nom}
                    </Text>
                    <Text style={{ marginTop: 3, color: "#64748B", fontWeight: "700", fontSize: 12 }}>
                      Note recalculée automatiquement
                    </Text>
                  </View>

                  <View
                    style={{
                      borderRadius: 12,
                      backgroundColor: "#DBEAFE",
                      borderWidth: 1,
                      borderColor: "rgba(37,99,235,0.25)",
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      minWidth: 92,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#1D4ED8", fontWeight: "900", fontSize: 12 }}>Note</Text>
                    <Text style={{ color: "#0f172a", fontWeight: "900", fontSize: 18 }}>
                      {formatNumber(note.note)} / {formatNumber(note.max)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
