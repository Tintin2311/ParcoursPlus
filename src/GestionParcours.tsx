// src/GestionParcours.tsx
import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  useWindowDimensions,
} from "react-native";
import { Compass, Gamepad2, MapPlus, X } from "lucide-react-native";

/* ======================= Types ======================= */
type SetPageFn = (page: any) => void;

type MenuItem = {
  id: "MesParcours" | "Creation" | "Association" | "PartageParcours";
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

/* ======================= Pages ======================= */
const PAGE_MES_PARCOURS = "MesParcours";
const PAGE_CREER_PARCOURS = "CreerUnNouveauParcours";
const PAGE_CREER_JEU_DES_ERREURS = "CreerJeuDesErreurs";
const PAGE_ASSOCIATION = "Association";
const PAGE_PARTAGE = "PartageParcours";

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

const DEFAULT_BOTTOM_SPACE = 96;

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

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

  const [creationModalVisible, setCreationModalVisible] = useState(false);
  const [gameModalVisible, setGameModalVisible] = useState(false);

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
        id: PAGE_MES_PARCOURS as "MesParcours",
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
        id: "Creation",
        title: "Création",
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
        id: PAGE_ASSOCIATION as "Association",
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
        id: PAGE_PARTAGE as "PartageParcours",
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

  const handlePressItem = (item: MenuItem) => {
    if (item.id === "Creation") {
      setCreationModalVisible(true);
      return;
    }

    setPage(item.id);
  };

  const openGameChoice = () => {
    setCreationModalVisible(false);
    setTimeout(() => {
      setGameModalVisible(true);
    }, 80);
  };

  const openCreateParcours = () => {
    setCreationModalVisible(false);
    setPage(PAGE_CREER_PARCOURS);
  };

  const openJeuDesErreursCreator = () => {
    setGameModalVisible(false);

    // IMPORTANT : ne pas modifier cette ligne.
    // Le nom doit correspondre exactement à App.tsx.
    setPage(PAGE_CREER_JEU_DES_ERREURS);
  };

  const content = (
    <View style={styles.fill}>
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
                onPress={() => handlePressItem(item)}
              />
            </View>
          ))}
        </View>
      </View>

      <ChoiceModal
        visible={creationModalVisible}
        title="Que veux-tu créer ?"
        onClose={() => setCreationModalVisible(false)}
      >
        <ChoiceButton
          icon={<Gamepad2 size={24} color="#FFFFFF" strokeWidth={2.4} />}
          title="Créer un jeu"
          subtitle="Créer une activité ludique pour les élèves"
          onPress={openGameChoice}
        />

        <ChoiceButton
          icon={<MapPlus size={24} color="#FFFFFF" strokeWidth={2.4} />}
          title="Créer un parcours"
          subtitle="Créer un parcours classique avec des balises"
          onPress={openCreateParcours}
        />
      </ChoiceModal>

      <ChoiceModal
        visible={gameModalVisible}
        title="Choisis ton jeu"
        onClose={() => setGameModalVisible(false)}
      >
        <ChoiceButton
          icon={<Gamepad2 size={24} color="#FFFFFF" strokeWidth={2.4} />}
          title="Le jeu des erreurs"
          subtitle="Créer une carte à corriger : éléments manquants ou faux"
          onPress={openJeuDesErreursCreator}
        />

        <View style={styles.disabledChoice}>
          <Text style={styles.disabledTitle}>Vrai / Faux / Manquant</Text>
          <Text style={styles.disabledSubtitle}>Disponible plus tard</Text>
        </View>
      </ChoiceModal>
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
          <Text
            style={[styles.cardTitle, { fontSize: titleSize }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/* ======================= Modal ======================= */
const ChoiceModal = ({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color="#1F5B86" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>{children}</View>
        </View>
      </View>
    </Modal>
  );
};

const ChoiceButton = ({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.choiceBtn}
      onPress={onPress}
    >
      <View style={styles.choiceIcon}>{icon}</View>

      <View style={styles.choiceTextBox}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceSubtitle}>{subtitle}</Text>
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11,31,48,0.48)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D5E1EA",
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 4 : 0,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  modalTitle: {
    flex: 1,
    color: "#1F5B86",
    fontSize: 20,
    fontWeight: "900",
  },

  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EEF6FC",
    alignItems: "center",
    justifyContent: "center",
  },

  modalContent: {
    gap: 12,
  },

  choiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F8FC",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#CFE0EC",
  },

  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#1F5B86",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  choiceTextBox: {
    flex: 1,
  },

  choiceTitle: {
    color: "#233548",
    fontSize: 16,
    fontWeight: "900",
  },

  choiceSubtitle: {
    color: "#6B7E8E",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
    lineHeight: 18,
  },

  disabledChoice: {
    backgroundColor: "#F1F1F1",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DDDDDD",
  },

  disabledTitle: {
    color: "#87929B",
    fontSize: 16,
    fontWeight: "900",
  },

  disabledSubtitle: {
    color: "#A1AAB1",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
});