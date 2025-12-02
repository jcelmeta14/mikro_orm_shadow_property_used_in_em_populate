import { Collection, Embeddable, Embedded, Entity, ManyToOne, MikroORM, OneToMany, PostgreSqlDriver, PrimaryKey, Property, Ref } from '@mikro-orm/postgresql';

@Entity()
class User {

  @PrimaryKey()
  id!: number;

  @Property()
  name: string;

  @Property({ unique: true })
  email: string;

  @OneToMany(() => Book, (book) => book.author)
  books = new Collection<Book>(this);

  constructor(name: string, email: string) {
    this.name = name;
    this.email = email;
  }

}

@Entity()
class Book {
  @PrimaryKey()
  id!: number;

  @Property()
  title!: string;

  @ManyToOne(() => User)
  author!: Ref<User>;

  @OneToMany(() => Chapter, (chapter) => chapter.book)
  chapters = new Collection<Chapter>(this);
}

@Embeddable()
class NestedChapterProperties {
  @Property()
  someEmbeddedProperty!: string;

  @Property({ persist: false, hidden: true })
  private someEmbeddedShadowProperty!: string;

  setSomeEmbeddedShadowProperty(value: string) {
    this.someEmbeddedShadowProperty = value;
  }
}

@Entity()
class Chapter {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Embedded(() => NestedChapterProperties)
  nestedProperties!: NestedChapterProperties;

  @ManyToOne(() => Book)
  book!: Ref<Book>;
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    driver: PostgreSqlDriver,
    dbName: 'reproduction',
    entities: [User, Book, Chapter],
    debug: ['query', 'query-params'],
    allowGlobalContext: true, // only for testing
    user: 'reproduction',
    password: 'reproduction',
    host: 'localhost',
    port: 54322,
  });
  await orm.schema.refreshDatabase();
});

afterAll(async () => {
  await orm.close(true);
});

test('populating user books after modifying a user should not include shadow property in query issued to the database', async () => {
  // Setup test
  const user = orm.em.create(User, { name: 'Foo', email: 'foo' });
  const book = orm.em.create(Book, { title: 'Book 1', author: user });
  const nestedChapterProperties = orm.em.create(NestedChapterProperties, { someEmbeddedProperty: 'Some Embedded Property 1' });
  nestedChapterProperties.setSomeEmbeddedShadowProperty('Do some specifc business logic here');
  const chapter = orm.em.create(Chapter, { name: 'Some Other Entity 1', book, nestedProperties: nestedChapterProperties });
  await orm.em.flush();

  // Create forked entity manager to get a fresh 
  const forkedEm = orm.em.fork({ clear: true });

  const updatedUserWithBooks = await forkedEm.transactional(async (em) => {
    const user = await em.findOneOrFail(User, { email: 'foo' });

    // Emulate some business logic that modifies the user
    user.name = 'Bar';

    await em.flush();

    // Load books, the problem is here the query that is generated is selecting the a column based on the shadow property name
    await em.populate(user, ['books', 'books.chapters']);

    return user;
  })

  expect(updatedUserWithBooks.books.length).toBe(1);
});
