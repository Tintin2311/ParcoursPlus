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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import BottomBarEleve from "./ui/BottomBarEleve";
import { supabase } from "./supabaseClient";

const BG =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilEleveBackground.png";

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

  // 🔥 LOAD SCORE FROM SUPABASE
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
      <ImageBackground source={{ uri: BG }} style={styles.bg}>
        <View style={styles.overlay} />

        {/* TOP HUD */}
        <View style={styles.topHud}>
          {/* SCORE */}
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

          {/* NAME */}
          <Text style={styles.name}>{nom}</Text>

          {/* LOGOUT BUTTON */}
          <Pressable
            onPress={() => setConfirmVisible(true)}
            style={styles.logoutBtn}
          >
            <Feather name="log-out" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* MODAL */}
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
                  <Text style={{ color: "#ccc" }}>Annuler</Text>
                </Pressable>

                <Pressable style={styles.confirmBtn} onPress={onLogout}>
                  {loggingOut ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff" }}>Déconnexion</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* BOTTOM BAR */}
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
  root: { flex: 1 },
  bg: { flex: 1 },
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
  },

  scoreChip: {
    position: "absolute",
    left: 0,
    flexDirection: "row",
    padding: 8,
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
  },

  name: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
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
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#111827",
  },

  modalText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  cancelBtn: {
    padding: 12,
  },

  confirmBtn: {
    padding: 12,
    backgroundColor: "#dc2626",
    borderRadius: 10,
  },
});