// src/GestionResultats.tsx
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
import Svg, { Path } from "react-native-svg";

/* ======================= Types ======================= */
type SetPageFn = (page: any) => void;

type MenuItem = {
  id:
    | "GestionResultatsTentatives"
    | "GestionPoints"
    | "GestionResultatsProgressivite";
  title: string;
  subtitle: string;
  imageUri: string;
};

type Props = { setPage: SetPageFn };

/* ======================= Couleurs ======================= */
const PAGE_BG = "#EDF2F6";
const HEADER_BG = "#1F5B86";
const HEADER_TITLE = "#FFFFFF";

const CONTENT_BG = "#EEF3F7";
const CONTENT_BORDER = "#C6D2DC";

const CARD_BG = "#FFFFFF";
const CARD_BORDER = "#C9D5DF";
const CARD_TITLE = "#233548";
const CARD_SUBTITLE = "#5F7386";

const TEXT_BG = "#E8F1FD";

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const DEFAULT_BOTTOM_SPACE = 96;

/* ======================= Images ======================= */
const IMG_TENTATIVES =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Prof_PageBaremes/BaremeTentative.png";

const IMG_POINTS =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Prof_PageBaremes/BaremesPoints.png";

const IMG_PROGRESSIVITE =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/Prof_PageBaremes/Progressivite.png";

/* ======================= Helpers ======================= */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* ======================= Composant principal ======================= */
const GestionResultats: React.FC<Props> = ({ setPage }) => {
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= 1100;
  const isTablet = width >= 768 && width < 1100;
  const isPhone = width < 768;
  const verySmallPhone = width < 380;

  const horizontalPadding = isDesktop ? 28 : isTablet ? 22 : 14;
  const topPadding = isDesktop ? 14 : isTablet ? 14 : 12;
  const listGap = isDesktop ? 18 : isTablet ? 16 : 14;

  const usableHeight = height - DEFAULT_BOTTOM_SPACE;
  const headerHeight = isDesktop ? 86 : isTablet ? 82 : 78;
  const contentVerticalPadding = isDesktop ? 18 : isTablet ? 16 : 16;

  const estimatedInnerHeight =
    usableHeight - headerHeight - contentVerticalPadding * 2 - topPadding;

  const rawCardHeight = (estimatedInnerHeight - listGap * 2) / 3;

  const cardHeight = clamp(
    rawCardHeight,
    isPhone ? (verySmallPhone ? 122 : 132) : 144,
    isDesktop ? 196 : 176
  );

  const titleSize = isDesktop ? 20 : isTablet ? 18 : verySmallPhone ? 15 : 16;
  const subtitleSize = isDesktop ? 14 : isTablet ? 13 : 12;
  const headerTitleSize = isDesktop ? 20 : isTablet ? 19 : 18;

  const items = useMemo<MenuItem[]>(
    () => [
      {
        id: "GestionResultatsTentatives",
        title: "Barème tentatives",
        subtitle: "Définissez la valeur de chaque essai.",
        imageUri: IMG_TENTATIVES,
      },
      {
        id: "GestionPoints",
        title: "Attribution des points",
        subtitle: "Configurez la façon de gagner des points.",
        imageUri: IMG_POINTS,
      },
      {
        id: "GestionResultatsProgressivite",
        title: "Progressivité",
        subtitle: "Faites évoluer la difficulté, choisissez les critères pour débloquer des parcours.",
        imageUri: IMG_PROGRESSIVITE,
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
          <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>
            BARÈMES
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
        <View style={{ gap: listGap }}>
          {items.map((item) => (
            <WaveCard
              key={item.id}
              item={item}
              height={cardHeight}
              titleSize={titleSize}
              subtitleSize={subtitleSize}
              isDesktop={isDesktop}
              isTablet={isTablet}
              isPhone={isPhone}
              onPress={() => setPage(item.id)}
            />
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
const WaveCard = ({
  item,
  onPress,
  height,
  titleSize,
  subtitleSize,
  isDesktop,
  isTablet,
  isPhone,
}: {
  item: MenuItem;
  onPress: () => void;
  height: number;
  titleSize: number;
  subtitleSize: number;
  isDesktop: boolean;
  isTablet: boolean;
  isPhone: boolean;
}) => {
  const imagePaneWidth = isDesktop ? "44%" : isTablet ? "43%" : "40%";
  const textPaneWidth = isDesktop ? "56%" : isTablet ? "57%" : "60%";

  const imageInset = isDesktop ? 12 : isTablet ? 10 : 8;
  const waveWidth = isDesktop ? 78 : isTablet ? 72 : 62;
  const textPaddingLeft = isDesktop ? 24 : isTablet ? 22 : 18;

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.card, { height }]}
    >
      <View style={styles.cardRow}>
        {/* ZONE IMAGE */}
        <View style={[styles.imagePane, { width: imagePaneWidth }]}>
          <View style={[styles.imageInner, { margin: imageInset }]}>
            <Image
              source={{ uri: item.imageUri }}
              resizeMode="contain"
              style={styles.cardImage}
            />
          </View>

          {/* Vague fluide placée au bord droit, sans couper l'image */}
          <View style={[styles.waveWrap, { width: waveWidth }]}>
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 120 300"
              preserveAspectRatio="none"
            >
              <Path
                d="
                  M 0 0
                  C 80 24, 100 60, 72 108
                  C 48 148, 46 182, 74 224
                  C 96 256, 96 284, 64 300
                  L 120 300
                  L 120 0
                  Z
                "
                fill={TEXT_BG}
              />
            </Svg>
          </View>
        </View>

        {/* ZONE TEXTE */}
        <View
          style={[
            styles.textPane,
            {
              width: textPaneWidth,
              paddingLeft: textPaddingLeft,
            },
          ]}
        >
          <Text
            style={[styles.cardTitle, { fontSize: titleSize }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          <Text
            style={[styles.cardSubtitle, { fontSize: subtitleSize }]}
            numberOfLines={3}
          >
            {item.subtitle}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default GestionResultats;

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

  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 22,
    overflow: "hidden",
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },

  cardRow: {
    flex: 1,
    flexDirection: "row",
  },

  imagePane: {
    position: "relative",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    justifyContent: "center",
  },

  imageInner: {
    flex: 1,
    zIndex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  cardImage: {
    width: "100%",
    height: "100%",
  },

  waveWrap: {
    position: "absolute",
    right: -24,
    top: 0,
    bottom: 0,
    zIndex: 2,
  },

  textPane: {
    backgroundColor: TEXT_BG,
    paddingRight: 14,
    paddingVertical: 14,
    justifyContent: "center",
  },

  cardTitle: {
    color: CARD_TITLE,
    fontWeight: "800",
    marginBottom: 6,
  },

  cardSubtitle: {
    color: CARD_SUBTITLE,
    fontWeight: "600",
    lineHeight: 20,
  },
});
