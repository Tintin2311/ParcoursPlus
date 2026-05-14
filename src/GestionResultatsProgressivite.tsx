// src/GestionResultatsProgressivite.tsx
import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { ArrowLeft } from "lucide-react-native";

import CreationCarteDeCompetence from "./GestionResultats/Progressivite/CreationCarteDeCompetence";
import CreationArbreDeCompetence from "./GestionResultats/Progressivite/CreationArbreDeCompetence";

const PAGE_BG = "#EDF2F6";
const HEADER_BG = "#1F5B86";
const HEADER_ICON_BG = "#2D6C97";
const HEADER_TITLE = "#FFFFFF";
const CONTENT_BG = "#EEF3F7";
const CONTENT_BORDER = "#C6D2DC";

export default function GestionResultatsProgressivite(props: any) {
  const { width } = useWindowDimensions();
  const [carteSelectionnee, setCarteSelectionnee] = useState<any | null>(null);

  const isDesktop = width >= 1100;
  const isTablet = width >= 768 && width < 1100;

  const horizontalPadding = isDesktop ? 28 : isTablet ? 22 : 14;
  const headerHeight = isDesktop ? 86 : isTablet ? 82 : 78;
  const headerTitleSize = isDesktop ? 20 : isTablet ? 19 : 18;
  const headerIconSize = isDesktop ? 20 : isTablet ? 19 : 18;
  const headerIconBox = isDesktop ? 40 : isTablet ? 40 : 38;

  const retourGestionResultats = () => {
    props?.setPage?.("GestionResultats");
  };

  const Header = () => (
    <View
      style={[
        styles.header,
        {
          minHeight: headerHeight,
          paddingHorizontal: horizontalPadding,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={retourGestionResultats}
        style={[
          styles.topIconButton,
          {
            width: headerIconBox,
            height: headerIconBox,
            borderRadius: 12,
          },
        ]}
      >
        <ArrowLeft size={headerIconSize} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      <View style={styles.headerCenter}>
        <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>
          Cartes de compétences
        </Text>
      </View>

      <View style={{ width: headerIconBox }} />
    </View>
  );

  if (carteSelectionnee) {
    return (
      <CreationArbreDeCompetence
        {...props}
        carte={carteSelectionnee}
        onBack={() => setCarteSelectionnee(null)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.fill}>
        <Header />

        <View style={styles.contentZone}>
          <CreationCarteDeCompetence
            {...props}
            onOpenCarte={(carte: any) => setCarteSelectionnee(carte)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },

  fill: {
    flex: 1,
  },

  header: {
    backgroundColor: HEADER_BG,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  topIconButton: {
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
  },

  headerTitle: {
    color: HEADER_TITLE,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  contentZone: {
    flex: 1,
    backgroundColor: CONTENT_BG,
    borderTopWidth: 1,
    borderTopColor: CONTENT_BORDER,
  },
});