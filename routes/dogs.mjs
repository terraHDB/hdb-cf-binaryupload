// eslint-disable-next-line no-unused-vars,require-await
import pov from 'point-of-view';
import multipart from '@fastify/multipart';
import formbody from '@fastify/formbody';
import cookie from '@fastify/cookie';
import ejs from 'ejs';
import path from 'path'
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export default async (server, { hdbCore, logger }) => {
  // GET, WITH NO preValidation AND USING hdbCore.requestWithoutAuthentication
  // BYPASSES ALL CHECKS: DO NOT USE RAW USER-SUBMITTED VALUES IN SQL STATEMENTS
  server.register(pov, {
    engine: { ejs },
    root: path.dirname(require.resolve('../templates/dog.ejs')),
  });
  server.register(multipart);
  server.register(formbody);
  server.register(cookie);
  const check_auth = (req, resp, done) => {
    req.body = {};
    req.headers.authorization = 'Bearer ' + req.cookies.auth;// 'Basic a3p5cDpsYWNraW5n';
    try {
      return hdbCore.preValidation[1](req, resp, (error) => {
        if (error)
          resp.code(302).header('Location', '/login.html').send('no dogs for you!');
        done(error);
      });
    } catch (error) {
      console.error(error);
      resp.code(302).header('Location', '/login.html');
    }
  };
  server.get("/dogs", {
    preValidation: check_auth,
    handler: async (request, reply) => {
      request.body = {
        operation: 'sql',
        sql: 'SELECT * FROM dev.dog ORDER BY dog_name'
      };
      let dogs = await hdbCore.requestWithoutAuthentication(request);
      return reply.view('dogs.ejs', { dogs });
    }
  });


  server.get("/dog/:id", {
    preValidation: check_auth,
    handler: async (request, reply) => {
      request.body = {
        operation: 'search_by_hash',
        schema: "dev",
        table: "dog",
        hash_values: [request.params.id],
        get_attributes: ['*']
      };
      let [dog] = await hdbCore.requestWithoutAuthentication(request);
      return reply.view('dog.ejs', { dog });
    }
  });

  server.post("/dog/:id", {
    preValidation: check_auth,
    handler: async (request, reply) => {
      request.body = {
        operation: 'search_by_hash',
        schema: "dev",
        table: "dog",
        hash_values: [request.params.id],
        get_attributes: ['*']
      };
      let [dog] = await hdbCore.requestWithoutAuthentication(request);
      dog = Object.assign({}, dog); // copy it
      const form_data = await request.file();
      const image_buffer = await form_data.toBuffer();
      if (image_buffer.length > 0) {
        dog.imageType = form_data.mimetype;
        dog.image = image_buffer;
      }
      dog.weight_lbs = +form_data.fields.weight.value;
      request.body = {
        operation: 'update',
        schema: "dev",
        table: "dog",
        records: [ dog ]
      };
      let result = await hdbCore.requestWithoutAuthentication(request);
      reply.code(303).header('Location', '/test/dog/' + request.params.id).send(result);
    }
  });

  server.get("/dog/:id/image", {
    preValidation: check_auth,
    handler: async (request, reply) => {
      request.body = {
        operation: 'search_by_hash',
        schema: "dev",
        table: "dog",
        hash_values: [request.params.id],
        get_attributes: ['image', 'imageType']
      };
      let [dog] = await hdbCore.requestWithoutAuthentication(request);
      reply.code(200).header('Content-Type', dog.imageType).send(dog.image);
    }
  });

  server.post("/login", async (request, reply) => {
    request.body = Object.assign(request.body, {
      operation: 'create_authentication_tokens'
    });
    let result = await hdbCore.request(request);
    reply.setCookie('auth', result.operation_token).code(303).header('Location', '/test/dogs').send(result);
  });
};
