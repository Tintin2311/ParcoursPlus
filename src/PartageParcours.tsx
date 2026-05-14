// PartageParcours.tsx
import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Building2,
  Map,
  Share2,
  Database,
  Users,
  ShieldCheck,
  Route,
  Trees,
  Search,
  Star,
} from "lucide-react-native";

type Props = {
  setPage?: (page: string) => void;
  professeur?: any;
};

export default function PartageParcours({ setPage, professeur }: Props) {
  const prenom =
    professeur?.prenom ||
    professeur?.first_name ||
    professeur?.nom ||
    "professeur";

  const goBack = () => {
    if (setPage) setPage("AccueilProf");
  };

  return (
    <LinearGradient colors={["#EAF7FF", "#D8F0FF", "#FFFFFF"]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={goBack} style={styles.backButton} activeOpacity={0.8}>
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.topTitleBox}>
            <Text style={styles.topTitle}>PARTAGE</Text>
            <Text style={styles.topSubtitle}>Parcours, balises et évaluations</Text>
          </View>

          <View style={styles.fakeIcon}>
            <Share2 size={22} color="#FFFFFF" />
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <LinearGradient colors={["#1F5B86", "#2E86C1"]} style={styles.heroGradient}>
              <View style={styles.heroIconCircle}>
                <Database size={42} color="#FFFFFF" />
              </View>

              <Text style={styles.heroTitle}>
                Une base commune pour partager la course d’orientation
              </Text>

              <Text style={styles.heroText}>
                Bonjour {prenom}, cette page permettra bientôt aux professeurs de mutualiser
                leurs parcours, leurs balises fixes, leurs évaluations et leurs données utiles.
              </Text>

              <View style={styles.heroBadges}>
                <View style={styles.badge}>
                  <Building2 size={16} color="#1F5B86" />
                  <Text style={styles.badgeText}>Établissement</Text>
                </View>

                <View style={styles.badge}>
                  <Trees size={16} color="#1F5B86" />
                  <Text style={styles.badgeText}>Parcs</Text>
                </View>

                <View style={styles.badge}>
                  <Users size={16} color="#1F5B86" />
                  <Text style={styles.badgeText}>Professeurs</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <Text style={styles.sectionTitle}>À quoi servira cette page ?</Text>

          <View style={styles.cardsGrid}>
            <FeatureCard
              icon={<Building2 size={30} color="#1F5B86" />}
              title="Centraliser par établissement"
              text="Deux professeurs d’un même collège pourront créer une seule fois les balises, puis partager les parcours et évaluations."
            />

            <FeatureCard
              icon={<Route size={30} color="#1F5B86" />}
              title="Partager ses parcours"
              text="Un professeur pourra rendre accessibles ses parcours à ses collègues ou à d’autres enseignants."
            />

            <FeatureCard
              icon={<Map size={30} color="#1F5B86" />}
              title="Créer une base par parc"
              text="Chaque parc pourra regrouper des balises fixes et plusieurs parcours prêts à utiliser."
            />

            <FeatureCard
              icon={<Search size={30} color="#1F5B86" />}
              title="Trouver rapidement"
              text="Un enseignant pourra chercher un lieu, consulter les parcours disponibles et gagner du temps de préparation."
            />
          </View>

          <View style={styles.bigPreview}>
            <Text style={styles.previewTitle}>Exemple d’usage</Text>

            <Step
              number="1"
              title="Un professeur crée les balises fixes"
              text="Il renseigne les codes, les points, les formats et les emplacements."
            />

            <Step
              number="2"
              title="Il partage les parcours"
              text="Les collègues de son établissement peuvent les récupérer sans tout recréer."
            />

            <Step
              number="3"
              title="D’autres professeurs découvrent le parc"
              text="Ils accèdent aux parcours disponibles et adaptent la séance à leurs élèves."
            />
          </View>

          <View style={styles.comingBox}>
            <ShieldCheck size={34} color="#1F5B86" />
            <Text style={styles.comingTitle}>Bientôt disponible</Text>
            <Text style={styles.comingText}>
              Cette fonctionnalité est pensée comme une bibliothèque collaborative :
              plus les professeurs partageront leurs parcours, plus la base deviendra riche,
              utile et rapide à utiliser.
            </Text>

            <View style={styles.fakeButton}>
              <Star size={19} color="#FFFFFF" />
              <Text style={styles.fakeButtonText}>Aperçu de la future plateforme</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>{icon}</View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>

      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  topBar: {
    height: 86,
    backgroundColor: "#1F5B86",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 10 : 0,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  topTitleBox: {
    flex: 1,
    alignItems: "center",
  },
  topTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  topSubtitle: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  fakeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 38,
  },
  heroCard: {
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: "#14507A",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    marginBottom: 24,
  },
  heroGradient: {
    padding: 24,
    alignItems: "center",
  },
  heroIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 18,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 34,
  },
  heroText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 24,
    marginTop: 14,
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 22,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  badgeText: {
    color: "#1F5B86",
    fontWeight: "900",
    fontSize: 13,
  },
  sectionTitle: {
    color: "#16496E",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 14,
  },
  cardsGrid: {
    gap: 14,
  },
  featureCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.12)",
    shadowColor: "#1F5B86",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  featureIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF7FF",
    marginBottom: 12,
  },
  featureTitle: {
    color: "#1F5B86",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 7,
  },
  featureText: {
    color: "#35566D",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  bigPreview: {
    marginTop: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    shadowColor: "#1F5B86",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  previewTitle: {
    color: "#16496E",
    fontSize: 21,
    fontWeight: "900",
    marginBottom: 16,
  },
  step: {
    flexDirection: "row",
    gap: 13,
    marginBottom: 16,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1F5B86",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: "#1F5B86",
    fontSize: 16,
    fontWeight: "900",
  },
  stepText: {
    color: "#466477",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 3,
  },
  comingBox: {
    marginTop: 22,
    backgroundColor: "#DFF3FF",
    borderRadius: 28,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.14)",
  },
  comingTitle: {
    color: "#1F5B86",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 10,
  },
  comingText: {
    color: "#34596F",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
  fakeButton: {
    marginTop: 18,
    backgroundColor: "#1F5B86",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fakeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
});