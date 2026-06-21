import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ScreenLayout } from '../../components/Layout';
import { Button, Card, Input, Textarea, Select, Badge, Modal } from '../../components/ui';
import { FileUpload } from '../../components/ui/FileUpload';
import {
  BookOpen,
  Package,
  Radio,
  FileText,
  Trash2,
  Search
} from 'lucide-react';

type ContentType = 'courses' | 'products' | 'tutorials' | 'podcasts';

interface ContentItem {
  id: string;
  title: string;
  description?: string;
  files: { name: string; url: string; size: number; type: string }[];
  created_at: string;
}

export const AdminFileManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ContentType>('courses');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchItems();
  }, [activeTab]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(activeTab)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setItems(data || []);
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    await supabase.from(activeTab).delete().eq('id', id);
    fetchItems();
  };

  const tabs = [
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'tutorials', label: 'Tutorials', icon: FileText },
    { id: 'podcasts', label: 'Podcasts', icon: Radio },
  ];

  return (
    <ScreenLayout title="Content Manager">
      <div className="p-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ContentType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#1e1e2d] text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-5 h-5" />}
            className="flex-1"
          />
          <Button onClick={() => { setEditingItem(null); setShowModal(true); }}>
            Add New
          </Button>
        </div>

        {/* Items List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-[#1e1e2d] rounded-xl h-32" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <ContentItemCard
                key={item.id}
                item={item}
                type={activeTab}
                onEdit={() => { setEditingItem(item); setShowModal(true); }}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        <ContentFormModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          type={activeTab}
          item={editingItem}
          onSuccess={() => { setShowModal(false); fetchItems(); }}
        />
      </div>
    </ScreenLayout>
  );
};

// Icons are imported above

// Content Item Card Component
const ContentItemCard: React.FC<{
  item: ContentItem;
  type: ContentType;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, type, onEdit, onDelete }) => {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-white font-medium">{item.title}</h3>
          {item.description && (
            <p className="text-gray-400 text-sm mt-1 line-clamp-2">{item.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="info">{type}</Badge>
            {item.files?.length > 0 && (
              <Badge variant="default">{item.files.length} files</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="w-4 h-4 text-red-400" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

// Content Form Modal Component
const ContentFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  type: ContentType;
  item: ContentItem | null;
  onSuccess: () => void;
}> = ({ isOpen, onClose, type, item, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    files: [] as { name: string; url: string; size: number; type: string }[]
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setFormData({
        title: item.title,
        description: item.description || '',
        category: '',
        files: item.files || []
      });
    } else {
      setFormData({ title: '', description: '', category: '', files: [] });
    }
  }, [item]);

  const handleSubmit = async () => {
    if (!formData.title) return;
    setLoading(true);

    try {
      const data = {
        title: formData.title,
        description: formData.description,
        category: formData.category || 'general',
        files: formData.files,
        is_published: true
      };

      if (item) {
        await supabase.from(type).update(data).eq('id', item.id);
      } else {
        await supabase.from(type).insert(data);
      }

      onSuccess();
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const handleFilesUploaded = (files: { name: string; url: string; size: number; type: string }[]) => {
    setFormData(prev => ({ ...prev, files: [...prev.files, ...files] }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item ? 'Edit' : 'Add New'} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <Input
          label="Title"
          placeholder="Enter title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />

        <Textarea
          label="Description"
          placeholder="Enter description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />

        <Select
          label="Category"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          options={[
            { value: 'general', label: 'General' },
            { value: 'premium', label: 'Premium' },
            { value: 'featured', label: 'Featured' }
          ]}
        />

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Files</label>
          <FileUpload
            onUpload={handleFilesUploaded}
            multiple
            maxSize={100}
            bucket={`${type}-files`}
          />
        </div>

        {/* Uploaded files */}
        {formData.files.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Uploaded Files</label>
            <div className="space-y-2">
              {formData.files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-[#1e1e2d] rounded-lg px-3 py-2">
                  <span className="text-sm text-white truncate">{file.name}</span>
                  <button
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      files: prev.files.filter((_, i) => i !== idx)
                    }))}
                    className="text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSubmit} loading={loading} className="flex-1">
            {item ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AdminFileManager;
