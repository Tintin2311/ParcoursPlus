// src/ui/BoutonParametres.tsx
import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

type BoutonParametresProps = {
  onPress: () => void;
};

const BoutonParametres: React.FC<BoutonParametresProps> = ({ onPress }) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.button}>
      <Feather name="menu" size={24} color="#333" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 10,
    backgroundColor: "transparent",  // Pas de fond
    borderRadius: 50,  // Pour rendre le bouton arrondi
    alignItems: "center",
    justifyContent: "center",
    // Ombre légère pour un effet de profondeur
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,  // Pour Android
  },
});

export default BoutonParametres;
