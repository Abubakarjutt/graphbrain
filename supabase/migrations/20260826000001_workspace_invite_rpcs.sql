-- Replaces createAdminClient() usage for workspace invites and member
-- email lookups so the service-role key never needs to ship in the
-- distributed desktop app. Each function checks caller authorization
-- itself; SECURITY DEFINER only grants the privilege to do so.

CREATE FUNCTION get_invite_by_token(p_token uuid)
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  invited_email text,
  role text,
  accepted_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.name, i.invited_email, i.role, i.accepted_at
  FROM workspace_invites i
  JOIN workspaces w ON w.id = i.workspace_id
  WHERE i.token = p_token
$$;

CREATE FUNCTION accept_workspace_invite(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite workspace_invites;
  v_caller_email text;
BEGIN
  SELECT * INTO v_invite FROM workspace_invites
    WHERE token = p_token AND accepted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite';
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS DISTINCT FROM v_invite.invited_email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_invite.workspace_id, auth.uid(), v_invite.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE workspace_invites SET accepted_at = now() WHERE token = p_token;

  RETURN v_invite.workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  )
$$;

CREATE FUNCTION get_workspace_member_emails(p_workspace_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email
  FROM auth.users u
  JOIN workspace_members m ON m.user_id = u.id
  WHERE m.workspace_id = p_workspace_id
    AND is_workspace_member(p_workspace_id)
$$;

GRANT EXECUTE ON FUNCTION get_invite_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION accept_workspace_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_workspace_member_emails(uuid) TO authenticated;
