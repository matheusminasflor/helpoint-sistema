ALTER TABLE public.mkt_artist_contracts RENAME COLUMN influencer_id TO artist_id;
ALTER TABLE public.mkt_artist_contracts
  ADD CONSTRAINT mkt_artist_contracts_artist_id_fkey
  FOREIGN KEY (artist_id) REFERENCES public.mkt_artists(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_mkt_artist_contracts_artist_id ON public.mkt_artist_contracts(artist_id);