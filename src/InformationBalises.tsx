// src/InformationBalises.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const C_TEXT = "#0f172a";
const C_BORDER = "rgba(0,0,0,0.12)";

/**
 * Pages de contenu :
 * - Tu peux éditer / réordonner librement ce tableau.
 * - Chaque item = une "page" du carrousel.
 */
const usePages = () =>
  useMemo(
    () => [
      {
        title: "Bienvenue",
        body:
          "Cette section explique comment utiliser l’écran “Gestion des balises”. " +
          "Balayez vers la gauche pour parcourir les différentes explications.",
      },
      {
        title: "Créer et modifier",
        body:
          "Appuyez sur “Créer une balise” pour en ajouter une nouvelle. " +
          "Touchez une tuile existante pour ouvrir sa fiche et modifier le code ou les points.",
      },
      {
        title: "Filtrer et rechercher",
        body:
          "Le bouton Filtrer permet de rechercher par code/numéro, de limiter à une plage ou une liste, " +
          "et d’afficher seulement les balises gelées ou inactives.",
      },
      {
        title: "Geler une balise",
        body:
          "Geler fait disparaître temporairement la balise de tous les parcours des élèves. Une pastille ❄︎ apparaît sur la tuile. " +
          "Vous pouvez dégeler à tout moment pour la faire réapparaître chez les élèves. " +
          "Cette fonctionnalité est très pratique si vous avez un doute sur l'existence actuelle d'une balise ou si une balise a disparu temporairement.",
      },
         {
        title: "Balises actives ou inactives",
        body:
          "Une balise est dite active quand elle fait partie d'au moins un parcours. " +
          "Une balise active apparaît en vert. " +
      "A l'inverse, une balise inactive apparaît en rouge et ne fait partie d'aucun parcours. ",
    },
    ],
    []
  );

const InformationBalises: React.FC<Props> = ({ visible, onClose }) => {
  const pages = usePages();
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onMomentumEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / SCREEN_W);
    setPageIndex(index);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Fond sombre */}
      <View style={styles.backdrop}>
        {/* Carte (style popup) */}
        <SafeAreaView style={styles.cardWrap}>
          {/* Barre de titre */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Informations</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Fermer le panneau d'informations"
            >
              <X size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Corps : carrousel horizontal paginé */}
          <View style={styles.body}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              contentContainerStyle={{ alignItems: "stretch" }}
            >
              {pages.map((p, i) => (
                <View key={i} style={[styles.page, { width: SCREEN_W - 24 }]}>
                  <Text style={styles.pageTitle}>{p.title}</Text>
                  <Text style={styles.pageText}>{p.body}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Indicateur de pages (petits points) */}
          <View style={styles.dotsWrap} accessibilityLabel={`Page ${pageIndex + 1} sur ${pages.length}`}>
            {pages.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === pageIndex && styles.dotActive]}
              />
            ))}
          </View>

          {/* Pas de bouton "Voir" — volontaire */}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

export default InformationBalises;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end", // carte en bas comme dans le screenshot
  },
  cardWrap: {
    width: "100%",
    maxHeight: SCREEN_H * 0.75,
    backgroundColor: "#cfd6df", // bande supérieure grise du screenshot
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 10,
    overflow: "hidden",
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#cfd6df",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#2b2b2b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  closeBtn: {
    position: "absolute",
    right: 10,
    top: Platform.select({ ios: 8, android: 10, default: 8 }),
    backgroundColor: "#d9534f",
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.25)",
  },
  body: {
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: "#e9eef5", // panneau central clair
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.25)",
    borderRadius: 10,
    overflow: "hidden",
  },
  page: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    height: 220,
    justifyContent: "center",
  },
  pageTitle: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: C_TEXT,
    marginBottom: 10,
  },
  pageText: {
    textAlign: "center",
    color: "rgba(15,23,42,0.85)",
    lineHeight: 20,
  },
  dotsWrap: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  dotActive: {
    backgroundColor: "#4b5563",
    transform: [{ scale: 1.25 }],
  },
});
