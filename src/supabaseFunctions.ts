import { supabase } from "./supabaseClient";

/**
 * Met à jour des données dans la table en sécurisant avec owner: user.id.
 * @param {string} table - Nom de la table Supabase (ex: "groupes").
 * @param {object} updates - Les données à mettre à jour (ex: { nom: "Nouveau nom" }).
 * @param {object} filters - Filtres supplémentaires, exemple { id: 123 }.
 * @returns {object|null} - Données mises à jour ou null si erreur.
 */
export async function updateDataWithOwner(table, updates, filters = {}) {
  // Récupérer l'utilisateur connecté
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Erreur récupération utilisateur :", userError.message);
    alert("Erreur récupération utilisateur : " + userError.message);
    return null;
  }

  // Construire la requête avec filtrage sur le owner
  let query = supabase.from(table).update(updates).eq("owner", user.id);

  // Appliquer dynamiquement les autres filtres (ex: par id)
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });

  // Exécuter la requête
  const { data, error } = await query.select();

  if (error) {
    console.error(
      `❌ Erreur Supabase lors de l'update dans ${table} :`,
      error.message
    );
    alert(`Erreur lors de l'update dans ${table} : ${error.message}`);
    return null;
  }

  console.log(`✅ Données mises à jour dans ${table} :`, data);
  return data[0];
}
