
import { supabase } from './supabase';
import * as CryptoJS from 'crypto-js';

export type AIProvider = 'openai' | 'claude';

export interface AppConfig {
  aiProvider: AIProvider;
  aiApiKey: string;
}

const ENCRYPTION_PREFIX = 'sec_v1_';

/**
 * Crypte la configuration en utilisant l'ID utilisateur comme partie de la clé
 */
const encrypt = (config: AppConfig, userId: string): string => {
  const secret = userId + '_app_secret';
  return ENCRYPTION_PREFIX + CryptoJS.AES.encrypt(JSON.stringify(config), secret).toString();
};

/**
 * Décrypte la configuration
 */
const decrypt = (encrypted: string, userId: string): AppConfig | null => {
  if (!encrypted.startsWith(ENCRYPTION_PREFIX)) return null;
  
  try {
    const secret = userId + '_app_secret';
    const ciphertext = encrypted.replace(ENCRYPTION_PREFIX, '');
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
    const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    return decryptedData;
  } catch (e) {
    console.error('Failed to decrypt config', e);
    return null;
  }
};

export const fetchConfig = async (): Promise<AppConfig> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('user_configs')
    .select('config_encrypted')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return {
      aiProvider: 'openai',
      aiApiKey: '',
    };
  }

  const decrypted = decrypt(data.config_encrypted, user.id);
  return decrypted || {
    aiProvider: 'openai',
    aiApiKey: '',
  };
};

export const saveConfig = async (config: AppConfig): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const encrypted = encrypt(config, user.id);

  const { error } = await supabase
    .from('user_configs')
    .upsert({ 
      user_id: user.id, 
      config_encrypted: encrypted,
      updated_at: new Date().toISOString() 
    });

  if (error) throw error;
};
