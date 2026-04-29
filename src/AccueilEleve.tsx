import React from "react";
import {
  View,
  Text,
  Platform,
  StyleSheet,
  ImageBackground,
  Pressable,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import BottomBarEleve from "./ui/BottomBarEleve";
import { supabase } from "./supabaseClient";

const BG_MOBILE =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilEleveBackground.png";

const BG_PAYSAGE =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilElevePaysage.png";

type EleveMin = {
  id?: string | null;
  uuid?: string | null;
  code?: string | null;
  display_name?: string | null;
  name?: string | null;
  nom?: string | null;
};

type Props = {
  setPage: (p: string) => void;
  eleveConnecte: EleveMin | null;
  handleDeconnexion: () => Promise<void> | void;
};

const AccueilEleve: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  handleDeconnexion,
}) => {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isLargeScreen = width >= 768;

  const backgroundImage = isLandscape || isLargeScreen ? BG_PAYSAGE : BG_MOBILE;

  const nom = (
    eleveConnecte?.display_name ??
    eleveConnecte?.name ??
    eleveConnecte?.nom ??
    "AVENTURIER"
  ).toUpperCase();

  const [score, setScore] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  React.useEffect(() => {
    const loadScore = async () => {
      if (!eleveConnecte?.id) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("eleve_parcours_stats")
        .select("best_points")
        .eq("student_id", eleveConnecte.id);

      if (!error && data) {
        const total = data.reduce(
          (sum, row) => sum + (Number(row.best_points) || 0),
          0
        );
        setScore(total);
      }

      setLoading(false);
    };

    loadScore();
  }, [eleveConnecte]);

  const onLogout = async () => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      await handleDeconnexion();
      setConfirmVisible(false);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.root}>
      <ImageBackground
        source={{ uri: backgroundImage }}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.overlay} />

        <View style={styles.topHud}>
          <View style={styles.scoreChip}>
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Text style={styles.score}>{score}</Text>
                <Text style={styles.unit}> PTS</Text>
              </>
            )}
          </View>

          <Text
            style={[
              styles.name,
              isLargeScreen && styles.nameLargeScreen,
            ]}
            numberOfLines={1}
          >
            {nom}
          </Text>

          <Pressable
            onPress={() => setConfirmVisible(true)}
            style={styles.logoutBtn}
          >
            <Feather name="log-out" size={18} color="#fff" />
          </Pressable>
        </View>

        <Modal transparent visible={confirmVisible} animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalBox}>
              <Text style={styles.modalText}>
                Êtes-vous certain de souhaiter vous déconnecter ?
              </Text>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setConfirmVisible(false)}
                >
                  <Text style={styles.cancelText}>Annuler</Text>
                </Pressable>

                <Pressable style={styles.confirmBtn} onPress={onLogout}>
                  {loggingOut ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmText}>Déconnexion</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <BottomBarEleve
          currentPage="AccueilEleve"
          onNavigate={(page) => setPage(page)}
        />
      </ImageBackground>
    </View>
  );
};

export default AccueilEleve;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  bg: {
    flex: 1,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },

  topHud: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    left: 12,
    right: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },

  scoreChip: {
    position: "absolute",
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  score: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },

  unit: {
    color: "#ccc",
    fontSize: 12,
    fontWeight: "800",
  },

  name: {
    maxWidth: "55%",
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
  },

  nameLargeScreen: {
    fontSize: 32,
    maxWidth: "70%",
  },

  logoutBtn: {
    position: "absolute",
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalBox: {
    width: "85%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#111827",
  },

  modalText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "700",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  cancelBtn: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  confirmBtn: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 10,
  },

  cancelText: {
    color: "#ccc",
    fontWeight: "800",
  },

  confirmText: {
    color: "#fff",
    fontWeight: "900",
  },
});