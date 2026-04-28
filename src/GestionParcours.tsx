// src/GestionParcours.tsx
import React, { useMemo } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import { Compass } from "lucide-react-native";

/* ======================= Types ======================= */
type SetPageFn = (page: any) => void;

type MenuItem = {
  id: "MesParcours" | "CreerUnNouveauParcours" | "Association" | "PartageParcours";
  title: string;
  imageUri: string;
  imageStyle?: {
    scale?: number;
    offsetX?: number;
    offsetY?: number;
    webScale?: number;
    tabletScale?: number;
  };
};

type Props = { setPage: SetPageFn };

/* ======================= Couleurs ======================= */
const PAGE_BG = "#EDF2F6";
const HEADER_BG = "#1F5B86";
const HEADER_ICON_BG = "#2D6C97";
const HEADER_TITLE = "#FFFFFF";

const CONTENT_BG = "#EEF3F7";
const CONTENT_BORDER = "#C6D2DC";

const CARD_BG = "#FFFFFF";
const CARD_BORDER = "#C9D5DF";
const CARD_TITLE = "#233548";

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const DEFAULT_BOTTOM_SPACE = 96;

/* ======================= Images ======================= */
const IMG_CREATION =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Prof_PageParcours/CreerParcours.png";

const IMG_PARTAGER =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Prof_PageParcours/PartagerParcours.png";

const IMG_ASSOCIER =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Prof_PageParcours/AssocierParcours1.png";

const IMG_MES_PARCOURS =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Prof_PageParcours/MesParcours.png";

/* ======================= Helpers ======================= */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* ======================= Composant principal ======================= */
const GestionParcours: React.FC<Props> = ({ setPage }) => {
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= 1100;
  const isTablet = width >= 768 && width < 1100;
  const isPhone = width < 768;
  const verySmallPhone = width < 380;

  const horizontalPadding = isDesktop ? 28 : isTablet ? 22 : 14;
  const topPadding = isDesktop ? 14 : isTablet ? 14 : 12;
  const gridGap = isDesktop ? 20 : isTablet ? 18 : 14;

  const usableHeight = height - DEFAULT_BOTTOM_SPACE;
  const headerHeight = isDesktop ? 86 : isTablet ? 82 : 78;
  const contentVerticalPadding = isDesktop ? 18 : isTablet ? 16 : 16;

  const estimatedInnerHeight =
    usableHeight - headerHeight - contentVerticalPadding * 2 - topPadding;

  const rawCardHeight = (estimatedInnerHeight - gridGap) / 2;

  const cardHeight = clamp(
    rawCardHeight,
    isPhone ? (verySmallPhone ? 150 : 165) : 180,
    isDesktop ? 250 : 220
  );

  const titleSize = isDesktop ? 18 : isTablet ? 17 : verySmallPhone ? 14 : 15;
  const headerTitleSize = isDesktop ? 20 : isTablet ? 19 : 18;
  const headerIconSize = isDesktop ? 18 : isTablet ? 18 : 17;
  const headerIconBox = isDesktop ? 34 : isTablet ? 34 : 32;

  const items = useMemo<MenuItem[]>(
    () => [
      {
        id: "MesParcours",
        title: "Mes parcours",
        imageUri: IMG_MES_PARCOURS,
        imageStyle: {
          scale: 1.04,
          tabletScale: 0.98,
          webScale: 0.94,
          offsetX: 0,
          offsetY: 0,
        },
      },
      {
        id: "CreerUnNouveauParcours",
        title: "Créer un parcours",
        imageUri: IMG_CREATION,
        imageStyle: {
          scale: 1.06,
          tabletScale: 0.98,
          webScale: 0.94,
          offsetX: 6,
          offsetY: 0,
        },
      },
      {
        id: "Association",
        title: "Associer classes",
        imageUri: IMG_ASSOCIER,
        imageStyle: {
          scale: 1.06,
          tabletScale: 0.98,
          webScale: 0.94,
          offsetX: 4,
          offsetY: 0,
        },
      },
      {
        id: "PartageParcours",
        title: "Partager",
        imageUri: IMG_PARTAGER,
        imageStyle: {
          scale: 1.0,
          tabletScale: 0.96,
          webScale: 0.92,
          offsetX: 0,
          offsetY: 0,
        },
      },
    ],
    []
  );

  const content = (
    <View style={styles.fill}>
      {/* HEADER */}
      <View
        style={[
          styles.header,
          {
            minHeight: headerHeight,
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.headerIconWrap,
              {
                width: headerIconBox,
                height: headerIconBox,
                borderRadius: 10,
                marginRight: 10,
              },
            ]}
          >
            <Compass size={headerIconSize} color="#FFFFFF" strokeWidth={2.2} />
          </View>

          <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>
            PARCOURS
          </Text>
        </View>
      </View>

      {/* CONTENT */}
      <View
        style={[
          styles.contentZone,
          {
            paddingHorizontal: horizontalPadding,
            paddingTop: topPadding,
            paddingBottom: contentVerticalPadding + DEFAULT_BOTTOM_SPACE,
          },
        ]}
      >
        <View style={[styles.grid, { marginHorizontal: -gridGap / 2 }]}>
          {items.map((item) => (
            <View
              key={item.id}
              style={{
                width: "50%",
                paddingHorizontal: gridGap / 2,
                marginBottom: gridGap,
              }}
            >
              <MenuCard
                item={item}
                height={cardHeight}
                titleSize={titleSize}
                isDesktop={isDesktop}
                isTablet={isTablet}
                onPress={() => setPage(item.id)}
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {isPhone ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
};

/* ======================= Carte ======================= */
const MenuCard = ({
  item,
  onPress,
  height,
  titleSize,
  isDesktop,
  isTablet,
}: {
  item: MenuItem;
  onPress: () => void;
  height: number;
  titleSize: number;
  isDesktop: boolean;
  isTablet: boolean;
}) => {
  const scale = isDesktop
    ? item.imageStyle?.webScale ?? item.imageStyle?.scale ?? 1.0
    : isTablet
    ? item.imageStyle?.tabletScale ?? item.imageStyle?.scale ?? 1.0
    : item.imageStyle?.scale ?? 1.0;

  const offsetX = item.imageStyle?.offsetX ?? 0;
  const offsetY = item.imageStyle?.offsetY ?? 0;

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.card, { height }]}
    >
      <View style={styles.cardMedia}>
        <Image
          source={{ uri: item.imageUri }}
          resizeMode="cover"
          style={[
            styles.cardImage,
            {
              width: `${scale * 100}%`,
              height: `${scale * 100}%`,
              transform: [{ translateX: offsetX }, { translateY: offsetY }],
            },
          ]}
        />

        <View style={styles.titleOverlay}>
          <Text style={[styles.cardTitle, { fontSize: titleSize }]} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default GestionParcours;

/* ======================= Styles ======================= */
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
    justifyContent: "center",
    paddingVertical: 8,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  headerIconWrap: {
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    color: HEADER_TITLE,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  contentZone: {
    flex: 1,
    backgroundColor: CONTENT_BG,
    borderTopWidth: 1,
    borderTopColor: CONTENT_BORDER,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    overflow: "hidden",
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },

  cardMedia: {
    flex: 1,
    position: "relative",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  cardImage: {
    position: "absolute",
    top: 0,
    left: 0,
  },

  titleOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },

  cardTitle: {
    color: CARD_TITLE,
    fontWeight: "800",
    textAlign: "center",
    width: "100%",
  },
});