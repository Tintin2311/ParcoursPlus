import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";

// Type mis à jour pour BottomBarItem
type BottomBarItem = {
  // L'id correspondra désormais plus directement au label
  id: "missions" | "score" | "accueil" | "ecole" | "marche";
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  // La pageKey reste la page racine de l'onglet
  pageKey: string;
};

type Props = {
  currentPage: string;
  onNavigate: (page: string) => void;
  emitTabId?: boolean;
  scrollProgress?: number;
};

// -- MODIFICATION ICI --
// L'ordre des éléments a été ajusté et les IDs et PageKeys ont été renommés
// pour plus de clarté et pour correspondre aux labels demandés.
const DEFAULT_ITEMS: BottomBarItem[] = [
  { id: "missions", label: "Mission", icon: "edit-3", pageKey: "EcrireResultat" },
  { id: "score", label: "Score", icon: "bar-chart-2", pageKey: "StatistiquesEleve" },
  { id: "accueil", label: "Accueil", icon: "home", pageKey: "AccueilEleve" },
  { id: "ecole", label: "École", icon: "book-open", pageKey: "AcademieEleve" }, // Renommé 'école'
  { id: "marche", label: "Marché", icon: "shopping-bag", pageKey: "BoutiqueEleve" }, // Renommé 'marche'
];

const BAR_HEIGHT = 80;
const ACTIVE = { r: 61, g: 214, b: 208 };
const INACTIVE = { r: 255, g: 255, b: 255 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function colorMix(t: number) {
  const r = Math.round(mix(INACTIVE.r, ACTIVE.r, t));
  const g = Math.round(mix(INACTIVE.g, ACTIVE.g, t));
  const b = Math.round(mix(INACTIVE.b, ACTIVE.b, t));
  return `rgb(${r},${g},${b})`;
}

const normalize = (s: string) => (s || "").trim().toLowerCase();

// -- MODIFICATION ICI --
// Les ensembles de pages ont été renommés pour correspondre aux nouveaux IDs.
// Assurez-vous d'ajouter ici TOUTES les pages appartenant à chaque onglet,
// en minuscules, pour que la détection de l'onglet actif fonctionne correctement.
const MISSIONS_PAGES = new Set(["ecrireresultat", "ecrirecodebaliseeleve"]);
const SCORE_PAGES = new Set(["statistiqueseleve"]); // Renommé de STATS_PAGES
const ACCUEIL_PAGES = new Set(["accueileleve", "accueil"]);
const ECOLE_PAGES = new Set(["academieeleve"]); // Renommé de ACADEMIE_PAGES
const MARCHE_PAGES = new Set(["boutiqueeleve", "marcheeleve"]); // Renommé de MARCHE_PAGES

// -- MODIFICATION ICI --
// La logique de resolveTabId a été mise à jour pour utiliser les nouveaux ensembles de pages.
function resolveTabId(currentPage: string): BottomBarItem["id"] {
  const page = normalize(currentPage);

  if (MISSIONS_PAGES.has(page)) return "missions";
  if (SCORE_PAGES.has(page)) return "score"; // Mis à jour
  if (ACCUEIL_PAGES.has(page)) return "accueil";
  if (ECOLE_PAGES.has(page)) return "ecole"; // Mis à jour
  if (MARCHE_PAGES.has(page)) return "marche"; // Mis à jour

  const found = DEFAULT_ITEMS.find(
    (item) => normalize(item.id) === page || normalize(item.pageKey) === page
  );

  return found ? found.id : "accueil";
}

// -- MODIFICATION ICI --
// getRootPageForTab a été mise à jour avec les nouveaux IDs de tabs.
function getRootPageForTab(tabId: BottomBarItem["id"]) {
  switch (tabId) {
    case "missions":
      return "EcrireResultat";
    case "score":
      return "StatistiquesEleve"; // Mis à jour
    case "accueil":
      return "AccueilEleve";
    case "ecole":
      return "AcademieEleve"; // Mis à jour
    case "marche":
      return "BoutiqueEleve"; // Mis à jour
    default:
      return "AccueilEleve";
  }
}

function getActiveIndex(currentPage: string) {
  const activeTabId = resolveTabId(currentPage);
  const idx = DEFAULT_ITEMS.findIndex((item) => item.id === activeTabId);
  return idx >= 0 ? idx : 2; // Par défaut à l'onglet Accueil si non trouvé
}

const BottomBarEleve: React.FC<Props> = ({
  currentPage,
  onNavigate,
  emitTabId = false,
  scrollProgress,
}) => {
  const { width } = useWindowDimensions();
  const isTiny = width < 360;

  const horizontalPadding = Math.round(Math.max(12, Math.min(28, width * 0.04)));
  const itemMinWidth = isTiny ? 54 : 62;
  const iconSize = isTiny ? 20 : 22;
  const bottomInset = Platform.OS === "ios" ? 6 : 0;

  const N = DEFAULT_ITEMS.length;
  const progAnim = useRef(new Animated.Value(0)).current;

  const activeIndex = useMemo(() => getActiveIndex(currentPage), [currentPage]);

  useEffect(() => {
    const target =
      typeof scrollProgress === "number"
        ? clamp(scrollProgress, 0, N - 1)
        : activeIndex;

    Animated.timing(progAnim, {
      toValue: target,
      duration: typeof scrollProgress === "number" ? 0 : 140,
      useNativeDriver: true,
    }).start();
  }, [scrollProgress, activeIndex, N, progAnim]);

  const weightFor = (i: number) => {
    const p =
      typeof scrollProgress === "number"
        ? clamp(scrollProgress, 0, N - 1)
        : activeIndex;

    const d = Math.abs(i - p);
    return clamp(1 - d, 0, 1);
  };

  const handleNavigation = useCallback(
    (item: BottomBarItem) => {
      const currentRaw = normalize(currentPage);
      const currentTabId = resolveTabId(currentPage);
      const tappedTabId = item.id;

      const rootPage = getRootPageForTab(tappedTabId);
      const target = emitTabId ? tappedTabId : rootPage;

      if (tappedTabId !== currentTabId) {
        onNavigate(target);
        return;
      }

      // Si on tape sur l'onglet déjà actif et qu'on n'est pas sur sa page racine,
      // on force le retour à la page racine (ou on transmet l'ID).
      if (currentRaw !== normalize(rootPage) && currentRaw !== normalize(tappedTabId)) {
        onNavigate(target);
      }
    },
    [currentPage, emitTabId, onNavigate]
  );

  const Item: React.FC<{ item: BottomBarItem; index: number }> = ({ item, index }) => {
    const w = weightFor(index);
    const color = colorMix(w);
    const bgOpacity = 0.18 * w;

    const scale = progAnim.interpolate({
      inputRange: [index - 1, index, index + 1],
      outputRange: [1, 1.1, 1],
      extrapolate: "clamp",
    });

    return (
      <TouchableOpacity
        onPress={() => handleNavigation(item)}
        activeOpacity={0.82}
        style={[styles.item, { minWidth: itemMinWidth }]}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        <Animated.View
          style={[
            styles.iconContainer,
            {
              backgroundColor: `rgba(${ACTIVE.r},${ACTIVE.g},${ACTIVE.b},${bgOpacity})`,
              transform: [{ scale }],
            },
          ]}
        >
          <Feather name={item.icon} size={iconSize} color={color} />
        </Animated.View>

        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {item.label.toUpperCase()}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={[styles.bar, { paddingBottom: bottomInset }]}>
        <View style={[styles.content, { paddingHorizontal: horizontalPadding }]}>
          <View style={styles.items}>
            {DEFAULT_ITEMS.map((item, index) => (
              <Item key={item.id} item={item} index={index} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    width: "100%",
    // Ne pas ajouter d'élévation ou d'ombre ici, ça peut gêner.
  },
  bar: {
    height: BAR_HEIGHT,
    width: "100%",
    backgroundColor: "#1f2937", // Un gris très foncé, presque noir
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  items: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  iconContainer: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12, // Légèrement arrondi
  },
  label: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
  },
});

export default BottomBarEleve;