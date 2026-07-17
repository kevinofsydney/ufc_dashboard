ALTER TABLE app_settings
ADD COLUMN preferred_openrouter_model TEXT;

ALTER TABLE app_settings
ADD COLUMN saved_openrouter_models_json TEXT NOT NULL DEFAULT '["deepseek/deepseek-v4-flash","deepseek/deepseek-v4-pro","z-ai/glm-5.2","nvidia/nemotron-3-ultra-550b-a55b:free","tencent/hy3:free"]';

ALTER TABLE app_settings
ADD COLUMN openrouter_reasoning_effort TEXT NOT NULL DEFAULT 'default'
CHECK (openrouter_reasoning_effort IN ('default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'));
