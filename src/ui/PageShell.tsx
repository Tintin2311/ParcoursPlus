// src/ui/PageShell.tsx
import React, { ReactNode } from "react";
import { View } from "react-native";
import BottomBar from "./BottomBar";

type Props = {
  pageId: string;                  // ex: "AccueilProf"
  setPage: (p: string) => void;    // ton routeur existant
  children: ReactNode;
  // Optionnel: si tu as des écrans scrollables très longs, tu peux passer un bottomOffset différent
  bottomOffset?: number; // hauteur approximative de la barre pour laisser de l'espace au scroll
};

export default function PageShell({
  pageId,
  setPage,
  children,
  bottomOffset = 84, // hauteur + marge de la barre
}: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: "#0b1220" }}>
      {/* Contenu de la page */}
      <View style={{ flex: 1, paddingBottom: bottomOffset }}>{children}</View>

      {/* Barre en bas (commune) */}
      <BottomBar currentPage={pageId} onNavigate={setPage} />
    </View>
  );
}
