import { useState } from 'react';
import { X, MapPin, Save, Building2 } from 'lucide-react';
import type { Photo } from '../../lib/supabase';
import SecureImage from './SecureImage';

interface PhotoLocationEditorProps {
  photo: Photo;
  onClose: () => void;
  onSave: (photoId: string, niveau: string, zone: string) => void;
}

export function PhotoLocationEditor({ photo, onClose, onSave }: PhotoLocationEditorProps) {
  const [niveau, setNiveau] = useState(photo.location?.floor || '');
  const [zone, setZone] = useState(photo.location?.room || '');

  const handleSave = () => {
    onSave(photo.id, niveau, zone);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MapPin size={20} className="text-[#E10600]" />
            <h2 className="text-lg font-semibold text-[#1A1A1A]">Modifier la localisation</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Photo Preview */}
        <div className="p-5">
          <div className="aspect-video rounded-lg overflow-hidden mb-4 border-2 border-gray-300 shadow-sm">
            <SecureImage
              storagePath={photo.storage_path}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Building2 size={16} className="text-[#E10600]" />
                Niveau / Étage
              </label>
              <input
                type="text"
                value={niveau}
                onChange={(e) => setNiveau(e.target.value)}
                placeholder="Ex: Sous-sol, RDC, Niveau 1..."
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-[#E10600]"
                list="level-options"
              />
              <datalist id="level-options">
                <option value="Sous-sol" />
                <option value="Rez-de-chaussée" />
                <option value="Niveau 1" />
                <option value="Niveau 2" />
                <option value="Niveau 3" />
                <option value="Niveau 4" />
                <option value="Toit" />
                <option value="Extérieur" />
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <MapPin size={16} className="text-[#E10600]" />
                Zone / Pièce
              </label>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="Ex: Cuisine, Hall, Bureau..."
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-[#E10600]"
                list="room-options"
              />
              <datalist id="room-options">
                <option value="Hall d'entrée" />
                <option value="Cuisine" />
                <option value="Salon" />
                <option value="Chambre" />
                <option value="Salle de bain" />
                <option value="Bureau" />
                <option value="Couloir" />
                <option value="Cage d'escalier" />
                <option value="Stationnement" />
                <option value="Local technique" />
              </datalist>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2.5 bg-[#E10600] text-white rounded-lg font-medium hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2"
            >
              <Save size={18} />
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface BulkLocationEditorProps {
  photoCount: number;
  onClose: () => void;
  onSave: (niveau: string, zone: string) => void;
}

export function BulkLocationEditor({ photoCount, onClose, onSave }: BulkLocationEditorProps) {
  const [niveau, setNiveau] = useState('');
  const [zone, setZone] = useState('');

  const handleSave = () => {
    onSave(niveau, zone);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MapPin size={20} className="text-[#E10600]" />
            <h2 className="text-lg font-semibold text-[#1A1A1A]">
              Édition en masse
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="p-5 pb-0">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800">
              <strong>{photoCount} photo{photoCount > 1 ? 's' : ''} sélectionnée{photoCount > 1 ? 's' : ''}</strong><br />
              La localisation sera appliquée à toutes les photos sélectionnées.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Building2 size={16} className="text-[#E10600]" />
                Niveau / Étage
              </label>
              <input
                type="text"
                value={niveau}
                onChange={(e) => setNiveau(e.target.value)}
                placeholder="Ex: Sous-sol, RDC, Niveau 1..."
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-[#E10600]"
                list="bulk-level-options"
              />
              <datalist id="bulk-level-options">
                <option value="Sous-sol" />
                <option value="Rez-de-chaussée" />
                <option value="Niveau 1" />
                <option value="Niveau 2" />
                <option value="Niveau 3" />
                <option value="Niveau 4" />
                <option value="Toit" />
                <option value="Extérieur" />
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <MapPin size={16} className="text-[#E10600]" />
                Zone / Pièce
              </label>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="Ex: Cuisine, Hall, Bureau..."
                className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E10600] focus:border-[#E10600]"
                list="bulk-room-options"
              />
              <datalist id="bulk-room-options">
                <option value="Hall d'entrée" />
                <option value="Cuisine" />
                <option value="Salon" />
                <option value="Chambre" />
                <option value="Salle de bain" />
                <option value="Bureau" />
                <option value="Couloir" />
                <option value="Cage d'escalier" />
                <option value="Stationnement" />
                <option value="Local technique" />
              </datalist>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6 mb-5">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!niveau && !zone}
              className="flex-1 px-4 py-2.5 bg-[#E10600] text-white rounded-lg font-medium hover:bg-[#C00500] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={18} />
              Appliquer à {photoCount} photo{photoCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
