// src/SessionProf/GestionGroupes/StatistiquesEleve.tsx
import React from "react";
import { SafeAreaView, Text, TouchableOpacity, View } from "react-native";

export default function StatistiquesEleve(props: any) {
  const eleve = props?.eleve ?? (globalThis as any).__selectedStatistiquesEleve;

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
          <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
            ← Retour
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: "900", color: "#233548" }}>
          Statistiques élève
        </Text>

        <Text style={{ marginTop: 12, fontSize: 18, color: "#233548" }}>
          Élève : {eleve?.name ?? "Aucun élève sélectionné"}
        </Text>

        <Text style={{ marginTop: 8, color: "#6B7E8E", fontWeight: "700" }}>
          Cette page sera construite plus tard.
        </Text>
      </View>
    </SafeAreaView>
  );
}