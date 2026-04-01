import { useCallback, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { analyzeInsurancePdf } from '../lib/analysisService';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export const PdfUpload = () => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Veuillez sélectionner un fichier PDF');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('Le fichier est trop volumineux (max 20 Mo)');
      return;
    }

    if (!user) {
      toast.error('Vous devez être connecté pour effectuer une analyse');
      return;
    }

    setUploading(true);
    toast.info('Analyse en cours, veuillez patienter...');

    try {
      const result = await analyzeInsurancePdf(file, user.id);
      
      toast.success('Analyse terminée avec succès');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      
      if (result && result.id) {
        navigate(`/contract/${result.id}`);
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast.error(error.message || 'Une erreur est survenue lors de l\'analyse');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        className={`relative flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-3xl transition-all duration-300 ${
          dragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-zinc-200 bg-white hover:border-primary/40 hover:bg-zinc-50/50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="pdf-upload"
          className="hidden"
          accept=".pdf"
          onChange={handleChange}
          disabled={uploading}
        />
        
        <label
          htmlFor="pdf-upload"
          className="flex flex-col items-center justify-center w-full h-full cursor-pointer"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
                <Loader2 className="h-12 w-12 text-primary animate-spin relative" />
              </div>
              <p className="text-lg font-bold tracking-tight">Analyse IA en cours...</p>
              <p className="text-sm text-zinc-400">Nous extrayons les données de votre contrat</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center p-8">
              <div className="p-5 rounded-2xl bg-zinc-50 text-zinc-400 group-hover:text-primary transition-colors">
                <Upload className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold tracking-tight">
                  Glissez votre relevé annuel ici
                </p>
                <p className="text-sm text-zinc-400">
                  Ou cliquez pour parcourir vos fichiers (PDF, max 20 Mo)
                </p>
              </div>
            </div>
          )}
        </label>
      </div>
    </div>
  );
};
