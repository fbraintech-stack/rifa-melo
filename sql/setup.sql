-- ======================================
-- RIFA HEINEKEN - Setup do Banco de Dados
-- Execute este SQL no Supabase SQL Editor
-- ======================================

-- Tabela principal: números da rifa
CREATE TABLE rifa_numeros (
    numero INT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'disponivel'
        CHECK (status IN ('disponivel', 'reservado', 'pago')),
    nome TEXT,
    telefone TEXT,
    reservado_em TIMESTAMPTZ,
    pago_em TIMESTAMPTZ
);

-- Inserir os 100 números
INSERT INTO rifa_numeros (numero)
SELECT generate_series(1, 100);

-- ======================================
-- FUNÇÕES RPC (SECURITY DEFINER — bypass RLS)
-- Só estas funções podem alterar dados
-- ======================================

-- Reservar números (atômica — resolve concorrência)
CREATE OR REPLACE FUNCTION reservar_numeros(
    p_numeros INT[],
    p_nome TEXT,
    p_telefone TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_disponiveis INT;
    v_total INT;
    v_indisponiveis INT[];
BEGIN
    v_total := array_length(p_numeros, 1);

    -- Validar quantidade máxima
    IF v_total IS NULL OR v_total < 1 THEN
        RETURN json_build_object('success', false, 'message', 'Selecione pelo menos 1 número');
    END IF;

    IF v_total > 10 THEN
        RETURN json_build_object('success', false, 'message', 'Máximo de 10 números por compra');
    END IF;

    -- Validar range dos números (1-100)
    IF EXISTS (SELECT 1 FROM unnest(p_numeros) n WHERE n < 1 OR n > 100) THEN
        RETURN json_build_object('success', false, 'message', 'Números devem estar entre 1 e 100');
    END IF;

    -- Travar as linhas primeiro (sem aggregate)
    PERFORM 1 FROM rifa_numeros
    WHERE numero = ANY(p_numeros)
    FOR UPDATE;

    -- Depois contar disponíveis
    SELECT COUNT(*) INTO v_disponiveis
    FROM rifa_numeros
    WHERE numero = ANY(p_numeros)
    AND status = 'disponivel';

    IF v_disponiveis != v_total THEN
        SELECT ARRAY_AGG(numero) INTO v_indisponiveis
        FROM rifa_numeros
        WHERE numero = ANY(p_numeros)
        AND status != 'disponivel';

        RETURN json_build_object(
            'success', false,
            'message', 'Alguns números já foram escolhidos por outra pessoa',
            'indisponiveis', v_indisponiveis
        );
    END IF;

    -- Sanitizar nome (limitar tamanho)
    IF length(p_nome) > 100 THEN
        p_nome := substring(p_nome from 1 for 100);
    END IF;

    UPDATE rifa_numeros
    SET status = 'reservado',
        nome = p_nome,
        telefone = p_telefone,
        reservado_em = NOW()
    WHERE numero = ANY(p_numeros)
    AND status = 'disponivel';

    RETURN json_build_object('success', true);
END;
$$;

-- Confirmar pagamento (admin — SECURITY DEFINER)
CREATE OR REPLACE FUNCTION confirmar_pagamento(p_numeros INT[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE rifa_numeros
    SET status = 'pago',
        pago_em = NOW()
    WHERE numero = ANY(p_numeros)
    AND status = 'reservado';

    RETURN json_build_object('success', true);
END;
$$;

-- Cancelar reserva (admin — SECURITY DEFINER)
CREATE OR REPLACE FUNCTION cancelar_reserva(p_numeros INT[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE rifa_numeros
    SET status = 'disponivel',
        nome = NULL,
        telefone = NULL,
        reservado_em = NULL,
        pago_em = NULL
    WHERE numero = ANY(p_numeros)
    AND status = 'reservado';

    RETURN json_build_object('success', true);
END;
$$;

-- ======================================
-- SEGURANÇA (RLS)
-- Apenas leitura pública — escrita só via RPC
-- ======================================
ALTER TABLE rifa_numeros ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode VER os números
CREATE POLICY "Leitura pública"
    ON rifa_numeros FOR SELECT USING (true);

-- SEM policy de UPDATE/INSERT/DELETE
-- Toda alteração passa pelas funções RPC (SECURITY DEFINER)

-- ======================================
-- IMPORTANTE: Após executar este SQL, vá em:
-- Database > Replication > Selecione "rifa_numeros"
-- Isso habilita as atualizações em tempo real
-- ======================================
