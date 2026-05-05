import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";

type TabId = "missions" | "score" | "accueil" | "ecole" | "marche";

type BottomBarItem = {
  id: TabId;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  pageKey: string;
};

type Props = {
  currentPage: string;
  onNavigate: (page: string) => void;
  hidden?: boolean;
};

const ITEMS: BottomBarItem[] = [
  { id: "missions", label: "Parcours", icon: "edit-3", pageKey: "EcrireResultat" },
  { id: "score", label: "Succès", icon: "award", pageKey: "ClassementEleve" },
  { id: "accueil", label: "Accueil", icon: "home", pageKey: "AccueilEleve" },
  { id: "ecole", label: "École", icon: "book-open", pageKey: "AcademieEleve" },
  { id: "marche", label: "Marché", icon: "shopping-bag", pageKey: "BoutiqueEleve" },
];

const ACTIVE_COLOR = "#3DD6D0";
const INACTIVE_COLOR = "#FFFFFF";

function normalize(value: string) {
  return (value || "").trim().toLowerCase();
}

function getActiveTab(currentPage: string): TabId {
  const page = normalize(currentPage);

  if (["ecrireresultat", "ecrirecodebaliseeleve"].includes(page)) return "missions";
  if (["classementeleve", "statistiqueseleve"].includes(page)) return "score";
  if (["accueileleve", "accueil"].includes(page)) return "accueil";
  if (["academieeleve"].includes(page)) return "ecole";
  if (["boutiqueeleve", "marcheeleve"].includes(page)) return "marche";

  return "accueil";
}

export default function BottomBarEleve({
  currentPage,
  onNavigate,
  hidden = false,
}: Props) {
  const { width } = useWindowDimensions();

  if (hidden) return null;

  const isTiny = width < 360;
  const iconSize = isTiny ? 20 : 22;
  const fontSize = isTiny ? 9 : 10;
  const activeTab = getActiveTab(currentPage);

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={styles.bar}>
        {ITEMS.map((item) => {
          const active = item.id === activeTab;
          const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;

          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.8}
              style={styles.item}
              onPress={() => onNavigate(item.pageKey)}
            >
              <View style={[styles.iconBox, active && styles.iconBoxActive]}>
                <Feather name={item.icon} size={iconSize} color={color} />
              </View>

              <Text numberOfLines={1} style={[styles.label, { color, fontSize }]}>
                {item.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    zIndex: 999,
  },

  bar: {
    height: Platform.OS === "ios" ? 86 : 80,
    width: "100%",
    backgroundColor: "#1f2937",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: Platform.OS === "ios" ? 6 : 0,
  },

  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },

  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  iconBoxActive: {
    backgroundColor: "rgba(61,214,208,0.18)",
  },

  label: {
    marginTop: 4,
    fontWeight: "800",
    letterSpacing: 0.35,
  },
});