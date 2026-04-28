// MinimalScreen.tsx
import React from "react";
import { View, Text, Pressable } from "react-native";

type Props = {
  setPage?: (p: string) => void;
  title?: string;
};

export default function MinimalScreen({ title = "Écran", setPage }: Props) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 8 }}>{title}</Text>
      <Text style={{ opacity: 0.7, marginBottom: 16 }}>
        Placeholder minimal — cross-platform (web / iOS / Android)
      </Text>
      {setPage && (
        <Pressable
          onPress={() => setPage("accueil")}
          style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#2563eb", borderRadius: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Retour à l’accueil</Text>
        </Pressable>
      )}
    </View>
  );
}
