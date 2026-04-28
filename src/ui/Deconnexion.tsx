// src/ui/Deconnexion.tsx
import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

type DeconnexionProps = {
  onDeconnexion: () => Promise<void>;
};

const Deconnexion: React.FC<DeconnexionProps> = ({ onDeconnexion }) => {
  return (
    <TouchableOpacity onPress={onDeconnexion} style={styles.button}>
      <Feather name="log-out" size={16} color="#fecaca" />
      <Text style={styles.buttonText}>Déconnexion</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.18)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
  },
  buttonText: {
    color: "#fecaca",
    marginLeft: 8,
  },
});

export default Deconnexion;
