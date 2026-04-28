import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Session } from '@supabase/supabase-js'; // Importez le type Session
import { supabase } from './SupabaseClient'; // Assurez-vous que le chemin est correct

// Composant pour le formulaire de profil
export default function ProfileFormScreen() {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  // Définissez le type de session pour inclure null
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Récupère la session de l'utilisateur une fois le composant monté
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  // Fonction pour mettre à jour le profil de l'utilisateur
  const handleUpdateProfile = async () => {
    if (!session) {
      Alert.alert('Erreur', 'Vous devez être connecté pour mettre à jour votre profil.');
      return;
    }
    
    setLoading(true);
    const { user } = session;

    // Utilise la méthode upsert pour mettre à jour ou créer un profil
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id, // L'ID de l'utilisateur de l'authentification est la clé primaire
        username,
        bio,
        updated_at: new Date(),
      });

    if (error) {
      Alert.alert('Erreur', error.message);
    } else {
      Alert.alert('Succès', 'Votre profil a été mis à jour !');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complétez votre profil</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Nom d'utilisateur"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        placeholderTextColor="#A0A0A0"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Bio (parlez de vous...)"
        value={bio}
        onChangeText={setBio}
        multiline
        autoCapitalize="none"
        placeholderTextColor="#A0A0A0"
      />

      <TouchableOpacity
        style={[styles.button, { opacity: loading ? 0.5 : 1 }]}
        onPress={handleUpdateProfile}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Chargement...' : 'Enregistrer'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1E1E1E',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    minHeight: 50,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#fff',
    marginBottom: 15,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#E94057',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
