import React from "react";
import {
  View,
  Text,
  SafeAreaView,
  Image,
  StyleSheet,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import BottomBar from "./ui/BottomBar";
import Deconnexion from "./ui/Deconnexion";
import BoutonParametres from "./ui/BoutonParametres";

type Professeur = { prenom?: string | null };

type AccueilProfProps = {
  setPage: (page: string) => void;
  professeur: Professeur | null;
  handleDeconnexion: () => Promise<void>;
};

const IMAGE_URL =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/BoussoleAccueil.png";

const AccueilProf: React.FC<AccueilProfProps> = ({
  professeur,
  setPage,
  handleDeconnexion,
}) => {
  const prenomBrut = professeur?.prenom?.trim() ?? "";
  const prenom =
    prenomBrut.length > 0
      ? prenomBrut.charAt(0).toUpperCase() + prenomBrut.slice(1)
      : "Professeur";

  const handleNavigation = (pageId: string) => {
    try {
      setPage(pageId);
    } catch (e) {
      console.error("Erreur de navigation :", e);
      Alert.alert("Erreur", "Erreur de navigation");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Bandeau actions */}
        <View style={styles.topBar}>
          <Deconnexion onDeconnexion={handleDeconnexion} />
          <BoutonParametres onPress={() => handleNavigation("Parametres")} />
        </View>

        {/* Image + dégradé */}
        <View style={styles.hero}>
          <Image source={{ uri: IMAGE_URL }} style={styles.image} />

          <LinearGradient
            colors={[
              "rgba(255,255,255,0)",
              "rgba(255,255,255,0.08)",
              "rgba(255,255,255,0.18)",
              "rgba(247,247,247,0.4)",
              "rgba(247,247,247,0.7)",
              "#f7f7f7",
            ]}
            locations={[0, 0.2, 0.4, 0.6, 0.8, 1]}
            style={styles.imageFade}
          />
        </View>

        {/* Texte directement intégré */}
        <View style={styles.content}>
          <Text style={styles.welcomeText}>Bonjour {prenom} !</Text>
          <Text style={styles.subText}>
            Bienvenue dans votre tableau de bord
          </Text>
        </View>

        {/* Bottom bar */}
        <BottomBar currentPage="AccueilProf" onNavigate={setPage} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f7",
  },
  keyboard: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 8,
    zIndex: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  hero: {
    width: "100%",
    height: "62%",
    position: "relative",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  imageFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "42%",
  },

  content: {
    flex: 1,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingBottom: 90,
  },

  welcomeText: {
    fontSize: 30,
    fontWeight: "700",
    color: "#1f2937",
    textAlign: "center",
    marginBottom: 8,

    // Lisibilité sur image
    textShadowColor: "rgba(255,255,255,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  subText: {
    fontSize: 16,
    color: "#4b5563",
    textAlign: "center",
    opacity: 0.8,
  },
});

export default AccueilProf;