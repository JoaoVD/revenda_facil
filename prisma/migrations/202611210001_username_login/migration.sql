-- Nome de usuário para login. O e-mail continua sendo a credencial do Supabase Auth.
CREATE TABLE "UserLogin" (
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserLogin_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "UserLogin_username_key" ON "UserLogin"("username");
ALTER TABLE "UserLogin" ENABLE ROW LEVEL SECURITY;
