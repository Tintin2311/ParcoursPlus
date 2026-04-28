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

type BottomBarItem = {
  id: "gestionGroupes" | "gestionBalises" | "accueil" | "gestionParcours" | "gestionResultats";
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  pageKey: string;
};

type Props = {
  currentPage: string;
  onNavigate: (id: string) => void;
  emitTabId?: boolean;
  scrollProgress?: number;
};

const DEFAULT_ITEMS: BottomBarItem[] = [
  { id: "gestionGroupes", label: "Groupes", icon: "users", pageKey: "gestionGroupes" },
  { id: "gestionBalises", label: "Balises", icon: "map-pin", pageKey: "gestionBalises" },
  { id: "accueil", label: "Accueil", icon: "home", pageKey: "AccueilProf" },
  { id: "gestionParcours", label: "Parcours", icon: "map", pageKey: "gestionParcours" },
  { id: "gestionResultats", label: "Barèmes", icon: "bar-chart-2", pageKey: "GestionResultats" },
];

const BAR_HEIGHT = 78;
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

/* =========================
   GROUPES DE PAGES PAR ONGLET
========================= */
const GROUPES_PAGES = new Set([
  "gestiongroupes",
  "gestioneleves",
]);

const BALISES_PAGES = new Set([
  "gestionbalises",
]);

const ACCUEIL_PAGES = new Set([
  "accueilprof",
  "accueil",
  "parametres",
]);

const PARCOURS_PAGES = new Set([
  "gestionparcours",
  "mesparcours",
  "creerunnouveauparcours",
  "creerunparcours",
  "associerparcoursetgroupes",
  "partageparcours",
]);

const BAREMES_PAGES = new Set([
  "gestionresultats",
  "gestionpoints",
  "gestionresultatstentatives",
  "gestionresultatsprogressivite",
  "gestionbaremes",
  "gestionresultatstentatives_parcours",
]);

function resolveTabId(currentPage: string): BottomBarItem["id"] {
  const page = normalize(currentPage);

  if (GROUPES_PAGES.has(page)) return "gestionGroupes";
  if (BALISES_PAGES.has(page)) return "gestionBalises";
  if (ACCUEIL_PAGES.has(page)) return "accueil";
  if (PARCOURS_PAGES.has(page)) return "gestionParcours";
  if (BAREMES_PAGES.has(page)) return "gestionResultats";

  const found = DEFAULT_ITEMS.find(
    (item) => normalize(item.id) === page || normalize(item.pageKey) === page
  );

  return found ? found.id : "accueil";
}

function getRootPageForTab(tabId: BottomBarItem["id"]) {
  switch (tabId) {
    case "gestionGroupes":
      return "gestionGroupes";
    case "gestionBalises":
      return "gestionBalises";
    case "accueil":
      return "AccueilProf";
    case "gestionParcours":
      return "gestionParcours";
    case "gestionResultats":
      return "GestionResultats";
    default:
      return "AccueilProf";
  }
}

function getActiveIndex(currentPage: string) {
  const activeTabId = resolveTabId(currentPage);
  const idx = DEFAULT_ITEMS.findIndex((item) => item.id === activeTabId);
  return idx >= 0 ? idx : 0;
}

const BottomBar: React.FC<Props> = ({
  currentPage,
  onNavigate,
  emitTabId = false,
  scrollProgress,
}) => {
  const { width } = useWindowDimensions();
  const isTiny = width < 360;

  const horizontalPadding = Math.round(Math.max(12, Math.min(28, width * 0.04)));
  const itemMinWidth = isTiny ? 56 : 64;
  const iconSize = isTiny ? 22 : 24;
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

      // 1) Si on clique sur un autre onglet : on navigue toujours
      if (tappedTabId !== currentTabId) {
        onNavigate(target);
        return;
      }

      // 2) Si on est dans une sous-page du même onglet, on revient à la page racine
      if (currentRaw !== normalize(rootPage) && currentRaw !== normalize(tappedTabId)) {
        onNavigate(target);
        return;
      }

      // 3) Si on est déjà sur la racine de cet onglet, on ne fait rien
    },
    [currentPage, emitTabId, onNavigate]
  );

  const Item: React.FC<{ item: BottomBarItem; index: number }> = ({ item, index }) => {
    const w = weightFor(index);
    const color = colorMix(w);
    const bgOpacity = 0.18 * w;

    const scale = progAnim.interpolate({
      inputRange: [index - 1, index, index + 1],
      outputRange: [1, 1.12, 1],
      extrapolate: "clamp",
    });

    return (
      <TouchableOpacity
        onPress={() => handleNavigation(item)}
        activeOpacity={0.8}
        style={[styles.item, { minWidth: itemMinWidth }]}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

        <Text style={[styles.label, { color }]}>{item.label.toUpperCase()}</Text>
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
  },
  bar: {
    height: BAR_HEIGHT,
    width: "100%",
    backgroundColor: "#1f2937",
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
    borderRadius: 12,
  },
  label: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});

export default BottomBar;